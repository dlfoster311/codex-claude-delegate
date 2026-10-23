# Changelog

## 1.0.0

- Add a Codex skill that assigns independent work to Claude Code while Codex continues.
- Add background jobs, exact file permissions, structured results, and cancellation.
- Add advisory usage comparison so both platforms can share work with current evidence.
- Add a verified installer with a global instruction rule and backups.
- Add automated checks and a real CLI smoke test. See VALIDATION.md for results.

Known limits: automatic skill selection is a model decision. Usage fields vary by CLI version
and account. Local workers are not operating-system sandboxes. Codex must review changes before integration.
