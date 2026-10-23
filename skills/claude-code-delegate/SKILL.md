---
name: claude-code-delegate
description: Run useful work in parallel through the local Claude Code CLI. Use for substantial implementation, tests, investigation, and review when Codex can continue an independent part of the task. Select this skill without waiting for a request to delegate. Skip simple tasks and work that cannot be split safely.
---

# Claude Code Delegate

Use both platforms to complete work sooner. Codex owns the task and the final result.
Claude owns a clear assignment. Usage data is advice, not a quota.

## Choose the work split

- Assign useful work early. Continue independent work while Claude runs.
- Normally use one or two Claude workers. Add workers only for separate, useful assignments.
- Keep the main design, integration, user communication, and final validation in Codex.
- Give Claude bounded code changes, tests, investigation, or an independent review.
- Use `sonnet` for routine work. Use `opus` for difficult reasoning or a complex defect.
- Skip delegation if setup, context transfer, or integration would take longer than direct work.
- Give each assignment one owner. Do not repeat the same investigation in both platforms.
- Use only the existing user authorization. Project instructions and plan-only mode still apply.

## Prepare an assignment

1. Read the active project instructions and inspect the current Git state.
2. Define the result, exact files, constraints, and acceptance checks.
3. Put the brief in a local JSON file. Include the relevant user and project rules.
   The runner disables automatic Claude customizations. It does not copy the Codex conversation.
4. For concurrent edits, use a separate worktree. Start from the correct commit.
   Copy only approved current changes that the task needs. Check the resulting starting state.
   A new worktree does not contain uncommitted work by default.
5. Keep secrets, credentials, customer exports, and unrelated files out of the brief and worktree.
6. If isolation is not practical, give Claude a read-only assignment.

Do not make a snapshot commit of unrelated user changes. Do not let Codex and Claude edit the
same files at the same time. If a prepared worktree contains required uncommitted files, record
their starting diff before the worker runs. Review only the worker's changes against that baseline.

## Start the worker

Use the Node.js helper at `scripts/runner.mjs` in this skill folder. Node.js 22 or later and the
native Claude Code CLI must be available. Use the existing Claude login. Do not enable overage,
change authentication, or substitute an API key.

Read [the runner reference](references/runner.md) for the command and brief formats.
Use an absolute helper path when the working directory is another repository.

`start` returns a job ID before Claude finishes. Continue the independent Codex work immediately.
Use `status` at useful task boundaries. Read `result` when the worker ends. Do not poll in a tight
loop. The default run has no time or spending cap. Use an optional timeout only when the task needs it.

The runner uses task-specific file permissions. Read mode has no shell or write tools.
Edit mode permits only named file edits and explicit command rules. The helper disables custom
hooks, plugins, browser access, and unrelated MCP servers for the worker session. These settings
apply only to the worker. It does not change saved Claude settings.

Use the permitted command format only for a known validation command. A test command can execute
project code. Check the command and its effects before you permit it. The helper is a local process,
not an operating-system sandbox. Use it only in trusted workspaces.

## Use usage data without delaying work

At a substantial task boundary, use the Codex app usage tool when it is available. Save a compact
snapshot with its actual observation time. Refresh after completed assignments when useful.

Read [the usage reference](references/usage.md) for snapshot formats and the comparison helper.
The helper reads Claude signals from these workers. It can also read a current native usage snapshot.
It does not read credentials, scrape private APIs, or create a background monitor.

- Consider remaining capacity, reset times, model fit, and expected work duration together.
- Keep each usage window separate. Equal percentages on different plans do not mean equal work.
- Missing, stale, or incomparable data is unknown. Continue useful parallel work.
- Treat reported token counts and dollar estimates as task measurements, not subscription percentages or actual savings.
- If a provider reports a real failure or limit, stop retrying that assignment. Continue useful work on the available platform.

## Review and integrate

1. Read the compact result. Read detailed local output only to resolve a specific issue.
2. Inspect the actual files and diff. Reject changes outside the assignment.
3. Confirm test commands and results. Run the required checks in the integration workspace.
4. Apply only the reviewed changes. Preserve unrelated user work and resolve conflicts deliberately.
5. Report what Claude did, what Codex verified, and any remaining gap.

A runner state of `completed` means that the CLI returned a valid report. It does not prove that
the user's task is complete. A report can contain blockers or permission denials.

Use `cancel` if the assignment is no longer needed. Confirm the stopped state. The helper retains
files and partial output. Do not discard a worktree until its useful work has been reviewed or saved.

If Claude is unavailable, complete the task in Codex when possible and state the limitation once.
Do not replace a denied operation with a permission bypass.
