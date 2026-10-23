# Runner reference

Use Node.js 22 or later. Install the native Claude Code CLI and sign in with its normal login.
The helper finds `claude` on PATH or in `~/.local/bin`. Use `--claude` to select a native executable.
Shell launchers such as `claude.cmd` are not supported.

## Task brief

Use these fields. Only `objective` is required for a read-only task.

| Field | Meaning |
| --- | --- |
| `objective` | One clear result. |
| `instructions` | Relevant user rules and project rules. |
| `files` | Exact paths to read, relative to the worker workspace. |
| `allowedChanges` | Exact relative file paths that the worker may change. Required in edit mode. |
| `checks` | Acceptance checks and expected behavior. |
| `allowedCommands` | Exact `Bash(command)` or `PowerShell(command)` permission rules for edit mode. |

Do not use wildcards or parent traversal in file paths. Read mode rejects changes and commands.
Command rules do not accept shell operators, wildcards, or command substitution. These rules
permit the command, including the project code it runs. They do not make an unsafe test safe.

This is a valid task for the public example project:

```json
{
  "objective": "Find why clamp returns the wrong value. Report the defect and correction.",
  "files": ["clamp.mjs", "clamp.test.mjs"],
  "checks": ["Give one failing input and its expected result."]
}
```

Run from this repository root. The example task file and project are included.

```sh
node skills/claude-code-delegate/scripts/runner.mjs start --workspace examples/clamp --task examples/investigate.json
```

Save the returned job ID. Pass that exact ID to `status`, `result`, or `cancel` with `--job`.
All commands accept `--state-dir PATH`. Use the same state directory for the same job.

An edit assignment must use `--mode edit`. The default model is `sonnet`. Select `--model opus`
when the task needs deeper reasoning. An optional `--timeout-seconds` stops a task after that time.
There is no default time or spending cap.

## State and output

The default local state directory is `%LOCALAPPDATA%/claude-code-delegate` on Windows.
On other systems it is `$XDG_STATE_HOME/claude-code-delegate`, or `~/.local/state/claude-code-delegate`.
`CLAUDE_DELEGATE_HOME` overrides this path. Keep state outside a repository that you publish.

Each job has a brief, state, event output, error output, and a final result when available.
These files can contain source code and task details. Treat them as private working files.
Do not publish them. The helper does not delete them automatically.

| State | Meaning |
| --- | --- |
| `queued`, `starting` | The worker has not started the Claude task yet. |
| `running` | Claude is running. |
| `cancelling` | Stop was requested. Check again for the final state. |
| `completed` | Claude returned a valid structured report. Codex must verify the work. |
| `failed` | Startup, execution, optional timeout, or result validation failed. |
| `cancelled` | The worker stopped after a cancellation request. Files remain available. |
| `interrupted` | The worker disappeared without a final result. Inspect local files before a retry. |

`cancel` uses a job request file. The active worker stops its own child process and descendants.
It does not kill a stored process ID after the worker has disappeared.

The final report includes a summary, changed files, findings, tests, and blockers. Result metadata
includes the model, duration, available usage, and permission-denial count. Dollar values are CLI
estimates. A zero process exit without a valid structured result is a failure.

## Failure recovery

Read the final error and the local `stderr.txt` first. Read only the relevant event lines.
Fix the stated cause before retrying. Start a new job after you have reviewed partial changes.
Do not keep retrying authentication, permission, or usage failures. Return useful work to Codex.
