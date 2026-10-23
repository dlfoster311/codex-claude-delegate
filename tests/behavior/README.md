# Delegation decision checks

These checks test the host model's work split. They do not call Claude or change project files.
The automated Node.js suite does not run them.

1. Give a fresh Codex evaluator the current SKILL.md and the requests in delegation-cases.json.
2. Treat each request as a separate task. Ask for the next actions and the owner of each result.
3. Do not give the evaluator this scoring table or the earlier evaluation output.
4. Compare the returned actions with this table. Record decisions and gaps, not matching words.

| Case | Required decision |
| --- | --- |
| feature | Codex implements a substantial part. One bounded Claude task runs in parallel. |
| reduce | Codex takes the main implementation. Claude still gets a useful smaller assignment. |
| refill | Codex reclaims substantive work. A free worker does not receive all remaining work. |
| stop | Codex does the task. It starts no Claude job. |
| tiny | Codex makes the small change directly. It starts no Claude job. |
| unknown_usage | Missing usage does not prevent the useful split. Codex still does substantive work. |
| unequal_usage | Capacity can affect assignment size or model choice. Codex retains direct work. |
| final_review | One bounded review can help while Codex runs validation after its own implementation. |

For every delegated case, require a specific independent result from each platform. Planning,
waiting, copying, and integration alone are not a substantive Codex implementation. Reject fixed
token or line-count ratios, repeated idle polling, overlapping edits, and ignored stop requests.

These are decision checks, not proof of later execution. For a live task, also inspect the actual
diff, task timing, and validation results. Do not infer contribution from line counts alone.
