---
name: claude-code-delegate
description: Pair direct Codex work with bounded help from the local Claude Code CLI. Use for substantial implementation, tests, investigation, and review when both can do useful independent work. Select this skill without waiting for a request to delegate. Skip simple tasks and work that cannot be split safely.
---

# Claude Code Delegate

Use both platforms to complete work sooner. Codex owns the task and does the main implementation
or investigation. Claude completes a bounded part in parallel. Usage data is advice, not a quota.

## Choose the work split

- Before dispatch, state briefly what Codex will produce and what Claude will produce.
- Keep a substantial implementation or investigation result in Codex. Planning, waiting,
  checking, copying, and integrating Claude output do not count as that direct contribution.
- Start one bounded Claude assignment early when a useful split exists. Codex starts its own
  work immediately. A second worker is useful only if Codex still has substantial independent work.
- Keep design decisions, integration, user communication, and final validation in Codex too.
- Give Claude bounded code changes, tests, investigation, or an independent review.
- Use `sonnet` for routine work. Use `opus` for difficult reasoning or a complex defect.
- Skip delegation if setup, context transfer, or integration would take longer than direct work.
- Give each assignment one owner. Do not repeat the same investigation in both platforms.
- Use only the existing user authorization. Project instructions and plan-only mode still apply.

For example, Codex can implement a feature while Claude adds tests in separate files. Codex can
trace a failing request while Claude checks one separate dependency. For a review, split the
components so Codex also examines source evidence and produces findings.

At each completed assignment, check the remaining work before starting another worker. A free
worker slot is not a reason to delegate. If Codex would only check and apply the next Claude result,
take that implementation or investigation directly. Do not turn one task into a sequence where
Claude produces every substantial part. Do not invent extra work to keep either platform busy.

After Codex has done its substantial work, a bounded final review can still help while Codex runs
required validation. Use it for a clear reason, not as a repeated review loop.

## Apply feedback to the work split

A request to use Claude less changes the amount of delegation. Keep the main work in Codex and
make the next useful Claude assignment smaller, or use one worker instead of two. Keep this
adjustment for the current task. Use Claude again when a useful independent assignment fits.

A request to stop using Claude, or to do the task entirely in Codex, takes precedence. Stop new
assignments for the requested scope and handle any active worker as the user directs. Do not
infer a stop request from criticism of excessive delegation. Do not impose a token percentage,
worker quota, or a requirement to call Claude on every turn.

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
- Usage can change assignment size and model choice. Keep Codex's direct contribution even
  when Claude has more available capacity. Do not change the work split to consume an allowance.
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
