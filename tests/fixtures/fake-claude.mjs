import fs from 'node:fs';
import path from 'node:path';
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk.toString('utf8');
const task = JSON.parse(prompt.slice(prompt.indexOf('{\n')));
const behavior = task.objective;
if (behavior === 'crash') { process.stderr.write('Test failure.\n'); process.exit(7); }
if (behavior === 'malformed') { process.stdout.write('not json\n'); process.exit(0); }
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
emit({ type: 'system', subtype: 'init', model: 'test-model' });
emit({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', resetsAt: Math.floor(Date.now() / 1000) + 9000 } });
if (behavior.startsWith('slow')) await new Promise(resolve => setTimeout(resolve, 3000));
if (['hang', 'callback-fail'].includes(behavior)) await new Promise(resolve => setTimeout(resolve, 60000));
if (behavior === 'edit') fs.writeFileSync(path.join(process.cwd(), task.allowedChanges[0]), 'verified change\n');
emit({
  type: 'result', subtype: 'success', is_error: false, num_turns: 1,
  structured_output: {
    summary: behavior, changedFiles: behavior === 'edit' ? task.allowedChanges : [],
    findings: [], tests: [], blockers: [],
  },
  usage: { input_tokens: 12, output_tokens: 8, cache_read_input_tokens: 3, cache_creation_input_tokens: 0 },
  total_cost_usd: 0.001, permission_denials: [],
});
