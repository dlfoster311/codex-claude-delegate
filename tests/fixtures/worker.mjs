import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, runWorker } from '../../skills/claude-code-delegate/scripts/runner.mjs';
const { flags } = parseArgs(process.argv.slice(2));
const job = JSON.parse(fs.readFileSync(path.join(flags['state-dir'], 'jobs', flags.job, 'job.json')));
if (['callback-fail', 'busy-once'].includes(job.task.objective)) {
  const rename = fs.renameSync;
  let writes = 0;
  fs.renameSync = (source, destination) => {
    if (path.basename(destination) === 'state.json' && ++writes === 3) {
      const error = new Error('Simulated callback storage failure');
      if (job.task.objective === 'busy-once') error.code = 'EPERM';
      throw error;
    }
    return rename(source, destination);
  };
}
await runWorker(flags['state-dir'], flags.job, (_command, args, options) =>
  job.task.objective === 'spawn-error' ? spawn(path.join(flags['state-dir'], 'missing-cli'), [], options) :
    spawn(process.execPath, [fileURLToPath(new URL('./fake-claude.mjs', import.meta.url)), ...args], options));
