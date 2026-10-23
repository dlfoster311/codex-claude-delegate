import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startJob, main, buildClaudeArgs, validateTask, finalResult, parseArgs } from '../skills/claude-code-delegate/scripts/runner.mjs';

const worker = fileURLToPath(new URL('./fixtures/worker.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-delegate-test-'));
const workspace = path.join(root, 'workspace with spaces ü');
fs.mkdirSync(workspace);
const state = path.join(root, 'state');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function launch(objective, extra = {}) {
  const task = path.join(root, 'task-' + Math.random() + '.json');
  fs.writeFileSync(task, JSON.stringify({ objective, ...extra.task }));
  return startJob({ workspace, task, 'state-dir': state, claude: process.execPath, ...extra.flags }, worker);
}
async function wait(id) {
  for (let i = 0; i < 150; i++) {
    const result = await main(['result', '--state-dir', state, '--job', id]);
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(result.state)) return result;
    await pause(100);
  }
  throw new Error('Test worker did not finish.');
}
test.after(() => {
  const resolved = fs.realpathSync(root);
  assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
  fs.rmSync(resolved, { recursive: true, force: true });
});

test('start returns before work ends and two workers overlap', async () => {
  const [first, second] = await Promise.all([launch('slow one'), launch('slow two')]);
  assert.notEqual(first.jobId, second.jobId);
  const [a, b] = await Promise.all([wait(first.jobId), wait(second.jobId)]);
  assert.equal(a.state, 'completed', JSON.stringify(a));
  assert.equal(b.state, 'completed', JSON.stringify(b));
  assert.ok(Date.parse(a.startedAt) < Date.parse(b.endedAt));
  assert.ok(Date.parse(b.startedAt) < Date.parse(a.endedAt));
  assert.ok(Date.parse(a.endedAt) - Date.parse(a.startedAt) >= 3000);
});
test('Unicode and shell-like prompt text arrives unchanged', async () => {
  const text = 'Résumé ✓ $HOME $(not-a-command) "quotes" & end';
  const job = await launch(text);
  const result = await wait(job.jobId);
  assert.equal(result.report.summary, text);
  assert.equal(result.usage.input_tokens, 12);
  assert.equal(result.estimatedCostUsd, 0.001);
  assert.equal(result.usageSnapshot.data.rate_limit_info.utilization, undefined);
});
test('failure and malformed output are not successful jobs', async () => {
  for (const behavior of ['crash', 'malformed']) {
    const job = await launch(behavior);
    const result = await wait(job.jobId);
    assert.equal(result.state, 'failed');
    assert.ok(result.error);
  }
});
test('cancel stops the owned worker and retains partial output', async () => {
  const job = await launch('hang');
  for (let i = 0; i < 50; i++) {
    const status = await main(['status', '--state-dir', state, '--job', job.jobId]);
    if (status.state === 'running') break;
    await pause(100);
  }
  const request = await main(['cancel', '--state-dir', state, '--job', job.jobId]);
  assert.equal(request.state, 'cancelling');
  const result = await wait(job.jobId);
  assert.equal(result.state, 'cancelled');
  assert.ok(fs.existsSync(path.join(state, 'jobs', job.jobId, 'events.jsonl')));
  const again = await main(['cancel', '--state-dir', state, '--job', job.jobId]);
  assert.equal(again.cancelRequested, false);
});
test('optional timeout stops a hung task', async () => {
  const job = await launch('hang', { flags: { 'timeout-seconds': '0.5' } });
  const result = await wait(job.jobId);
  assert.equal(result.state, 'failed');
  assert.match(result.error, /timeout/);
});
test('edit mode carries exact file permissions and produces a file', async () => {
  const job = await launch('edit', { flags: { mode: 'edit' }, task: { allowedChanges: ['result.txt'] } });
  const result = await wait(job.jobId);
  assert.equal(result.state, 'completed');
  assert.equal(fs.readFileSync(path.join(workspace, 'result.txt'), 'utf8'), 'verified change\n');
  const config = JSON.parse(fs.readFileSync(path.join(state, 'jobs', job.jobId, 'job.json')));
  const args = buildClaudeArgs(config);
  assert.ok(args.includes('Edit(./result.txt)'));
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  assert.ok(!args.includes('--bare'));
});
test('read mode excludes writes and commands; paths cannot escape', () => {
  assert.throws(() => validateTask({ objective: 'x', allowedChanges: ['x'] }, workspace, 'read'), /Read mode/);
  assert.throws(() => validateTask({ objective: 'x', files: ['../secret'] }, workspace, 'read'), /relative/);
  assert.throws(() => validateTask({ objective: 'x', unknown: true }, workspace, 'read'), /Unknown/);
  assert.throws(() => validateTask({ objective: 'x', allowedChanges: ['x'], allowedCommands: ['Bash(node *; bad)'] }, workspace, 'edit'), /exact/);
  const args = buildClaudeArgs({ mode: 'read', model: 'sonnet', task: { allowedChanges: [], allowedCommands: [] } });
  assert.equal(args[args.indexOf('--tools') + 1], 'Read,Glob,Grep');
});
test('an absent report or a successful exit alone cannot mean success', () => {
  assert.equal(finalResult(null, 0).state, 'failed');
  assert.equal(finalResult({ type: 'result', is_error: true, subtype: 'error' }, 0).state, 'failed');
  assert.equal(finalResult({ type: 'result', is_error: false, subtype: 'success' }, 0).state, 'failed');
});
test('invalid job IDs and CLI options fail early', async () => {
  await assert.rejects(main(['status', '--job', '../outside', '--state-dir', state]), /job ID/);
  assert.throws(() => parseArgs(['start', '--mode']), /value/);
  assert.throws(() => parseArgs(['start', '--nope', 'x']), /Unknown/);
});

test('non-string error payloads return a failed result without throwing', () => {
  assert.equal(finalResult({ type: 'result', result: { error: 'bad' } }, 1).state, 'failed');
  assert.match(finalResult({ type: 'result', errors: [{ code: 'bad' }] }, 1).error, /bad/);
});

test('dangling links and command substitution are rejected', t => {
  assert.throws(() => validateTask({ objective: 'x', allowedChanges: ['x'], allowedCommands: ['Bash(echo `whoami`)'] }, workspace, 'edit'), /exact/);
  const link = path.join(workspace, 'dangling');
  try { fs.symlinkSync(path.join(root, 'not-created'), link, 'junction'); }
  catch (error) { if (['EPERM', 'ENOTSUP'].includes(error.code)) { t.skip('Links are not available.'); return; } throw error; }
  assert.throws(() => validateTask({ objective: 'x', allowedChanges: ['dangling/new.txt'] }, workspace, 'edit'), /symbolic link/);
});

test('callback storage failures stop the owned Claude process', async () => {
  const job = await launch('callback-fail');
  const result = await wait(job.jobId);
  assert.equal(result.state, 'failed');
  assert.match(result.error, /callback storage failure/);
  const status = await main(['status', '--state-dir', state, '--job', job.jobId]);
  assert.throws(() => process.kill(status.childPid, 0));
});

test('native spawn errors produce a failed result', async () => {
  const job = await launch('spawn-error');
  const result = await wait(job.jobId);
  assert.equal(result.state, 'failed');
  assert.match(result.error, /ENOENT/);
});

test('a temporary state-file sharing error is retried', async () => {
  const job = await launch('busy-once');
  const result = await wait(job.jobId);
  assert.equal(result.state, 'completed', JSON.stringify(result));
});
