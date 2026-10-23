# Validation

Release: 1.0.1. Local validation date: 2026-10-23.

## Version 1.0.1

- JavaScript syntax, JSON checks, and all 78 automated tests passed on Windows.
- The added installer test replaced an old managed rule and preserved surrounding user instructions.
- The Codex skill validator passed. Automatic selection remains enabled.
- A fresh Codex evaluator passed all eight [delegation decision checks](tests/behavior/README.md).
  It received the skill and requests, without the scoring guide or earlier results.
- Codex retained the main implementation in the feature, reduced-delegation, completed-worker,
  and usage cases. It used no worker for the explicit stop or tiny edit. It allowed a bounded
  final review after Codex had done the implementation.
- One real Sonnet job proposed test scenarios while Codex wrote the policy, installer rule,
  regression test, and documentation. The worker changed no source files.

These decision checks test instructions. They do not prove behavior throughout every future task.
The runner and usage algorithms did not change in this release. Their live execution checks from
version 1.0.0 are recorded below. CI runs the automated suite on all six platform/version pairs.

## Version 1.0.0 live checks (2026-10-22)

- JavaScript syntax and JSON checks passed. Plain JavaScript needs no separate build.
- All 77 automated tests passed on Windows with Node.js 24.19.0.
- The Codex skill validator passed.
- Claude Code 2.1.308 completed two jobs in parallel through the runner.
- One job diagnosed the sample defect without edits. The other fixed one file in an isolated Git worktree.
- The parent verified that the original workspace and test file did not change.
- The fixture failed before the fix and passed after the fix. Both real jobs had zero permission denials.
- A separate native CLI check denied a Read request outside the worker workspace under restricted mode.
- Current Claude events exposed five-hour and weekly usage. The helper compared the weekly window with a fresh Codex snapshot.
- The installer checked all seven installed skill files and kept the existing global instructions as a backup.
- A fresh Codex session selected the installed skill without an explicit skill request.

The real jobs used Sonnet. The final parallel smoke run took about ten seconds for the two worker
assignments. This is a small fixture result, not a general speed benchmark.

Claude also built the usage helper and reviewed the runner. Codex inspected the returned files,
ran the tests, and fixed supported review findings before publication. Regression checks cover
worker callback failures, temporary Windows file locks, installation rollback, workspace aliases, path links, and
malformed results.

## Reproduce

```sh
npm run check
npm run smoke:live
```

The automated suite uses a fake local CLI and no account usage. The live smoke test uses the
existing Claude login and allowance. It retains evidence in ignored local work files.

The package has no npm dependencies. The lint script checks JavaScript syntax and JSON. It is not
a type checker or a general security scanner.

## Validation boundaries

The fresh Codex check selected the skill and its installed path. Its read-only session policy
blocked shell reads, so that session did not verify the worker command. The installed runner was
validated separately with real Claude jobs. The global delegation rule also loaded in the active chat.

The local tests ran on Windows. CI runs the automated suite on Windows, Linux, and macOS with
Node.js 22 and 24. Check the repository's CI result for those environments. The real Claude smoke
check is not run in public CI because it needs a signed-in account.

Automatic selection remains a model decision. Usage fields can vary by CLI version and account.
No result here proves equal plan capacities, dollar savings, or a fixed speed increase.
