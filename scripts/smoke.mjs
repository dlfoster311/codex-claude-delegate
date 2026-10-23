import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { startJob, main } from '../skills/claude-code-delegate/scripts/runner.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(repo, 'work', 'smoke-' + randomUUID());
const base = path.join(root, 'base');
const edit = path.join(root, 'edit');
const state = path.join(root, 'state');
fs.mkdirSync(root, { recursive: true });
fs.cpSync(path.join(repo, 'examples', 'clamp'), base, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: base, encoding: 'utf8', stdio: 'pipe' });
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
git('init', '-b', 'main');
git('config', 'core.autocrlf', 'false');
git('add', 'clamp.mjs', 'clamp.test.mjs');
git('-c', 'user.name=Smoke Test', '-c', 'user.email=smoke@localhost', 'commit', '-m', 'Add smoke fixture');
git('worktree', 'add', '-b', 'claude-edit', edit, 'HEAD');
const baseline = hash(path.join(base, 'clamp.mjs'));
const testBaseline = hash(path.join(base, 'clamp.test.mjs'));
let originalFailed = false;
try { execFileSync(process.execPath, ['--test', 'clamp.test.mjs'], { cwd: base, stdio: 'pipe' }); }
catch { originalFailed = true; }
assert.ok(originalFailed, 'The defect must fail before Claude changes it.');
const jobs = await Promise.all([
  startJob({ workspace: base, task: path.join(repo, 'examples', 'investigate.json'), 'state-dir': state }),
  startJob({ workspace: edit, task: path.join(repo, 'examples', 'fix.json'), mode: 'edit', 'state-dir': state }),
]);
console.log('Two Claude jobs started. Independent parent checks now run.');
assert.equal(hash(path.join(base, 'clamp.mjs')), baseline);
let results;
const deadline = Date.now() + 180000;
while (Date.now() < deadline) {
  results = await Promise.all(jobs.map(job => main(['result', '--job', job.jobId, '--state-dir', state])));
  if (results.every(result => ['completed', 'failed', 'cancelled', 'interrupted'].includes(result.state))) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!results.every(result => result.state === 'completed')) {
  await Promise.all(jobs.map(job => main(['cancel', '--job', job.jobId, '--state-dir', state])));
  throw new Error('Live test did not finish successfully. Evidence is retained at ' + root);
}
assert.ok(Date.parse(results[0].startedAt) < Date.parse(results[1].endedAt));
assert.ok(Date.parse(results[1].startedAt) < Date.parse(results[0].endedAt));
assert.equal(hash(path.join(base, 'clamp.mjs')), baseline);
assert.equal(hash(path.join(edit, 'clamp.test.mjs')), testBaseline);
const changed = execFileSync('git', ['diff', '--name-only'], { cwd: edit, encoding: 'utf8' }).trim();
assert.equal(changed, 'clamp.mjs');
const testOutput = execFileSync(process.execPath, ['--test', 'clamp.test.mjs'], { cwd: edit, encoding: 'utf8' });
const summary = {
  passed: true, checkedAt: new Date().toISOString(),
  overlappingJobs: true, baseUnchanged: true, testsUnchanged: true, changedFiles: [changed],
  jobs: results.map(result => ({ jobId: result.jobId, model: result.resolvedModel, durationMs: result.durationMs, permissionDenials: result.permissionDenials })),
  testOutput, evidenceDirectory: root,
};
fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
