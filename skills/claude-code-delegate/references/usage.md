# Usage reference

Speed and task fit decide the work split. Usage is supporting evidence.

The comparison helper accepts current Codex and Claude snapshots. It returns each platform's
windows and compares fresh all-model windows with the same duration. It does not equate the plans'
absolute capacities or predict money saved.

## Collect a snapshot

Use the Codex app `get_usage_limits` tool when available. Parse the tool's JSON response first.
Wrap the parsed data in `{ "observedAt": ..., "data": ... }`. Set `observedAt` to the UTC time of
the actual read. Save only the rate-limit buckets and their primary/secondary measurements.
Exclude account IDs, emails, credit balances, and other account fields.

For Claude, the runner captures `rate_limit_event` signals when the CLI emits them. The helper
uses the latest saved event by default. A native status-line snapshot with `rate_limits` is also
supported through `--claude FILE`. Use the actual observation time. Do not install a new status-line
hook or read credential stores just to populate a percentage.

Each snapshot must have an ISO UTC `observedAt` string that ends in `Z`, and a `data` object.
Missing values remain unknown. Snapshots older than 15 minutes are stale. Expired windows do not
count as current capacity. The helper does not treat `allowed` without utilization as zero usage.

## Compare

From the repository root, with a saved Codex snapshot:

```sh
node skills/claude-code-delegate/scripts/usage-cli.mjs --codex work/codex-usage.json
```

If no Codex tool is available, run the helper without `--codex`. It reports that side as unknown.
Use `--state-dir PATH` if the jobs used a custom state directory.

The helper supports these native fields:

- Codex: `rateLimitsByLimitId`, or the legacy `rateLimits`; `usedPercent`, `windowDurationMins`, and `resetsAt`.
- Claude status line: `rate_limits.five_hour` and `rate_limits.seven_day`; `used_percentage` and `resets_at`.
- Claude event: `rate_limit_info`; `rateLimitType`, `status`, `utilization`, and `resetsAt`.

Native reset fields use epoch seconds. A Claude event's utilization is a fraction from 0 to 1.
Model-specific windows remain separate. Duplicate windows are not combined.

A Claude run result can include tokens and estimated API-equivalent cost without an account
percentage. Keep those measures separate. Never infer remaining subscription capacity from them.
Do not delay an assignment to fetch unavailable usage data.

Official references:

- [Claude CLI results](https://code.claude.com/docs/en/headless)
- [Claude status-line data](https://code.claude.com/docs/en/statusline)
- [Codex global instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
`rate_limit_info.unifiedWindows` is also supported. Each window has `utilization` and `resetsAt`.
