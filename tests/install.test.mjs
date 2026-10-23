import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { install, updateInstructions, DEFAULT_RULE } from '../scripts/install.mjs';

test('global rule is idempotent and preserves unrelated instructions byte for byte', () => {
  const original = 'User rules.\r\nPreserve this line.\r\n';
  const updated = updateInstructions(original);
  assert.ok(updated.startsWith(original));
  assert.equal(updateInstructions(updated), updated);
  assert.throws(() => updateInstructions('<!-- BEGIN claude-code-delegate -->'), /invalid markers/);
});

test('an existing global rule is replaced while surrounding user instructions stay intact', () => {
  const before = 'User instruction before the rule.\r\n\r\n';
  const after = '\r\n\r\nUser instruction after the rule.\r\n';
  const old = '<!-- BEGIN claude-code-delegate -->\nPrevious delegation policy.\n<!-- END claude-code-delegate -->';
  const updated = updateInstructions(before + old + after);
  assert.equal(updated, before + DEFAULT_RULE + after);
  assert.equal(updateInstructions(updated), updated);
});
test('install verifies files, preserves active override, and keeps update backups', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-install-test-'));
  try {
    const original = 'Existing override.\n';
    fs.writeFileSync(path.join(home, 'AGENTS.override.md'), original);
    const result = install({ codexHome: home, enableDefault: true });
    assert.ok(result.verifiedFiles >= 3);
    assert.ok(fs.readFileSync(result.globalInstructions, 'utf8').startsWith(original));
    assert.equal(fs.readFileSync(path.join(result.backup, 'AGENTS.override.md'), 'utf8'), original);
    assert.throws(() => install({ codexHome: home }), /already installed/);
    const updated = install({ codexHome: home, enableDefault: true, update: true });
    assert.ok(fs.existsSync(path.join(updated.backup, 'skill', 'SKILL.md')));
    assert.equal(fs.readFileSync(updated.globalInstructions, 'utf8').split('<!-- BEGIN claude-code-delegate -->').length, 2);
  } finally {
    assert.ok(fs.realpathSync(home).startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('a failed update move keeps the original skill in place', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-install-failure-'));
  const rename = fs.renameSync;
  try {
    const first = install({ codexHome: home });
    fs.writeFileSync(path.join(first.installed, 'owner-note.txt'), 'keep me');
    fs.renameSync = (source, destination) => {
      if (source === first.installed && path.basename(destination) === 'skill') {
        const error = new Error('Simulated locked installation'); error.code = 'EPERM'; throw error;
      }
      return rename(source, destination);
    };
    assert.throws(() => install({ codexHome: home, update: true }), /locked installation/);
    assert.equal(fs.readFileSync(path.join(first.installed, 'owner-note.txt'), 'utf8'), 'keep me');
    assert.equal(fs.readdirSync(path.join(home, 'skills')).length, 1);
  } finally {
    fs.renameSync = rename;
    assert.ok(fs.realpathSync(home).startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('failed new-copy activation restores the old skill and instructions', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-install-rollback-'));
  const rename = fs.renameSync;
  try {
    const first = install({ codexHome: home, enableDefault: true });
    fs.writeFileSync(path.join(first.installed, 'owner-note.txt'), 'keep me');
    const instructions = fs.readFileSync(first.globalInstructions, 'utf8');
    fs.renameSync = (source, destination) => {
      if (path.basename(source).startsWith('.claude-code-delegate-') && destination === first.installed) throw new Error('Simulated activation failure');
      return rename(source, destination);
    };
    assert.throws(() => install({ codexHome: home, update: true, enableDefault: true }), /activation failure/);
    assert.equal(fs.readFileSync(path.join(first.installed, 'owner-note.txt'), 'utf8'), 'keep me');
    assert.equal(fs.readFileSync(first.globalInstructions, 'utf8'), instructions);
    assert.equal(fs.readdirSync(path.join(home, 'skills')).length, 1);
  } finally {
    fs.renameSync = rename;
    assert.ok(fs.realpathSync(home).startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    fs.rmSync(home, { recursive: true, force: true });
  }
});
