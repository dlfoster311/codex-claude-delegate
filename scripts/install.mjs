#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'skills', 'claude-code-delegate');
const BEGIN = '<!-- BEGIN claude-code-delegate -->';
const END = '<!-- END claude-code-delegate -->';
export const DEFAULT_RULE = [
  BEGIN,
  '## Parallel work with Claude Code',
  '',
  'Use the claude-code-delegate skill for substantial tasks with useful independent work.',
  'Assign implementation, tests, investigation, or review to the local Claude Code CLI early.',
  'Continue independent work in Codex while Claude runs. Normally use one or two Claude workers.',
  'Skip delegation when it adds delay. Match the Claude model to the task.',
  'Use available Codex and Claude usage data as advice; missing data must not delay work.',
  'Keep each assignment within the user-approved scope and the active project instructions.',
  'Review Claude changes and verify required checks before integration.',
  END,
].join('\n');

export function updateInstructions(original) {
  const start = original.indexOf(BEGIN);
  const end = original.indexOf(END);
  if ((start === -1) !== (end === -1) || (start !== -1 && (end < start ||
      original.indexOf(BEGIN, start + 1) !== -1 || original.indexOf(END, end + 1) !== -1))) {
    throw new Error('The existing delegation rule has invalid markers. No instructions were changed.');
  }
  if (start !== -1) return original.slice(0, start) + DEFAULT_RULE + original.slice(end + END.length);
  return original + (original.endsWith('\n\n') ? '' : original.endsWith('\n') ? '\n' : original ? '\n\n' : '') + DEFAULT_RULE + '\n';
}

export function fileHashes(root) {
  const result = {};
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Skill source must not contain symbolic links.');
      if (entry.isDirectory()) visit(file);
      else result[path.relative(root, file).replaceAll('\\', '/')] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  }
  visit(root);
  return result;
}
export function install({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), enableDefault = false, update = false } = {}) {
  const home = path.resolve(codexHome);
  const skills = path.join(home, 'skills');
  const destination = path.join(skills, 'claude-code-delegate');
  const exists = fs.existsSync(destination);
  if (exists && fs.lstatSync(destination).isSymbolicLink()) throw new Error('The installed skill is a link. Use its original installer to update it.');
  if (exists && !update) throw new Error('The skill is already installed. Use --update to keep a backup and replace it.');
  const override = path.join(home, 'AGENTS.override.md');
  const instructions = fs.existsSync(override) && fs.readFileSync(override, 'utf8').trim() ? override : path.join(home, 'AGENTS.md');
  if (enableDefault && fs.existsSync(instructions) && fs.lstatSync(instructions).isSymbolicLink()) throw new Error('The instruction file is a link. Update it through its owner.');
  const original = fs.existsSync(instructions) ? fs.readFileSync(instructions, 'utf8') : '';
  const updated = enableDefault ? updateInstructions(original) : original;
  const hashes = fileHashes(SOURCE);
  fs.mkdirSync(skills, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID().slice(0, 8);
  const backup = path.join(home, 'backups', 'claude-code-delegate', stamp);
  const stage = path.join(skills, '.claude-code-delegate-' + randomUUID());
  let moved = false;
  let installedNew = false;
  try {
    fs.cpSync(SOURCE, stage, { recursive: true, errorOnExist: true });
    if (exists || (enableDefault && original !== updated)) fs.mkdirSync(backup, { recursive: true });
    if (exists) { fs.renameSync(destination, path.join(backup, 'skill')); moved = true; }
    fs.renameSync(stage, destination);
    installedNew = true;
    if (JSON.stringify(fileHashes(destination)) !== JSON.stringify(hashes)) throw new Error('Installed file verification failed.');
    if (enableDefault && updated !== original) {
      if (fs.existsSync(instructions)) fs.copyFileSync(instructions, path.join(backup, path.basename(instructions)));
      const temp = instructions + '.' + randomUUID() + '.tmp';
      fs.writeFileSync(temp, updated);
      fs.renameSync(temp, instructions);
    }
  } catch (error) {
    try {
      fs.mkdirSync(backup, { recursive: true });
      if (installedNew) fs.renameSync(destination, path.join(backup, 'failed-copy'));
      if (moved) fs.renameSync(path.join(backup, 'skill'), destination);
      if (fs.existsSync(stage)) fs.renameSync(stage, path.join(backup, 'incomplete-stage'));
    } catch (recoveryError) {
      throw new Error('Install failed: ' + error.message + '. Recovery failed: ' + recoveryError.message + '. Inspect ' + backup);
    }
    throw error;
  }
  return {
    installed: destination, verifiedFiles: Object.keys(hashes).length,
    globalInstructions: enableDefault ? instructions : null,
    backup: fs.existsSync(backup) ? backup : null,
    next: 'The skill will be available on the next Codex turn. Start a new chat to verify the global rule.',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--enable-default') options.enableDefault = true;
      else if (args[i] === '--update') options.update = true;
      else if (args[i] === '--codex-home' && args[i + 1]) options.codexHome = args[++i];
      else throw new Error('Use --enable-default, --update, or --codex-home PATH.');
    }
    console.log(JSON.stringify(install(options), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
