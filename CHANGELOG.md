# Changelog

## 1.0.1

- Keep the main implementation or investigation in Codex. Review and integration alone are not enough.
- Start with one bounded Claude assignment. Reassess before assigning more work.
- Reduce assignment size or worker count after a request for less delegation. Preserve useful parallel work unless the user asks to stop.
- Apply the same work split in the skill, its default prompt, and the installed global rule.
- Validate the installer update and delegation decisions. See VALIDATION.md for results.

Known limit: the host model applies these instructions. They do not enforce a numeric work ratio.

## 1.0.0

- Add a Codex skill that assigns independent work to Claude Code while Codex continues.
- Add background jobs, exact file permissions, structured results, and cancellation.
- Add advisory usage comparison so both platforms can share work with current evidence.
- Add a verified installer with a global instruction rule and backups.
- Add automated checks and a real CLI smoke test. See VALIDATION.md for results.
- Resolve workspace aliases before path checks, including macOS temporary directories.

Known limits: automatic skill selection is a model decision. Usage fields vary by CLI version
and account. Local workers are not operating-system sandboxes. Codex must review changes before integration.
