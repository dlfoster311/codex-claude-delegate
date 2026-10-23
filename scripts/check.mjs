import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['.git', 'node_modules', 'work', 'outputs'].includes(entry.name)) return [];
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(name) : [name];
  });
}
const files = walk('.');
for (const file of files.filter(file => file.endsWith('.mjs'))) execFileSync(process.execPath, ['--check', file]);
for (const file of files.filter(file => file.endsWith('.json'))) JSON.parse(readFileSync(file, 'utf8'));
console.log('JavaScript syntax and JSON checks passed.');
