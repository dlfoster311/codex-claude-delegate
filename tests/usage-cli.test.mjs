import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../skills/claude-code-delegate/scripts/usage-cli.mjs', import.meta.url));
test('usage CLI selects a valid current snapshot after an invalid one', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-usage-test-'));
  try {
    const jobs = path.join(root, 'jobs');
    for (const [id, snapshot] of [
      ['00000000-0000-0000-0000-000000000000', { observedAt: 'bad', data: {} }],
      ['11111111-1111-1111-1111-111111111111', { observedAt: new Date().toISOString(), data: { rate_limit_info: {
        status: 'allowed', rateLimitType: 'five_hour', utilization: 0, resetsAt: Date.now() / 1000 + 3600,
      } } }],
    ]) {
      fs.mkdirSync(path.join(jobs, id), { recursive: true });
      fs.writeFileSync(path.join(jobs, id, 'usage-snapshot.json'), JSON.stringify(snapshot));
    }
    const data = JSON.parse(execFileSync(process.execPath, [cli, '--state-dir', root], { encoding: 'utf8' }));
    assert.equal(data.codex.state, 'unknown');
    assert.equal(data.claude.state, 'fresh');
    assert.equal(data.claude.windows[0].usedPercent, 0);
  } finally {
    assert.ok(fs.realpathSync(root).startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
