#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { compareUsage } from './usage.mjs';
import { stateRoot } from './runner.mjs';
const args = process.argv.slice(2);
const flags = {};
try {
  for (let i = 0; i < args.length; i += 2) {
    if (!['--codex', '--claude', '--state-dir'].includes(args[i]) || !args[i + 1]) throw new Error('Use --codex FILE, --claude FILE, or --state-dir PATH.');
    flags[args[i].slice(2)] = args[i + 1];
  }
  const read = file => file ? JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) : null;
  let claude = read(flags.claude);
  if (!flags.claude) {
    const jobs = path.join(flags['state-dir'] || stateRoot(), 'jobs');
    // Only this runner's job snapshots are read. Claude credentials and other chats are not read.
    if (fs.existsSync(jobs)) {
      for (const name of fs.readdirSync(jobs)) {
        if (!/^[0-9a-f-]{36}$/i.test(name)) continue;
        const file = path.join(jobs, name, 'usage-snapshot.json');
        if (fs.existsSync(file)) {
          try {
            const candidate = read(file);
            const observed = Date.parse(candidate.observedAt);
            if (Number.isFinite(observed) && observed <= Date.now() + 60000 &&
                (!claude || observed > Date.parse(claude.observedAt))) claude = candidate;
          } catch { /* A missing or incomplete snapshot is unknown usage. */ }
        }
      }
    }
  }
  console.log(JSON.stringify(compareUsage(read(flags.codex), claude), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
