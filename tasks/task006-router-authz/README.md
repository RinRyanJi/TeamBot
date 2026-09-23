# task006 — Router: identity check, allowlist, per-conversation binding, permission table

- Phase: 1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Route only verified !tb messages. Enforce group member allowlist, per-conversation binding, and the §5 permission table (start/query/continue-stop/approve-answer/admin).

## Acceptance (evidence-based)

Tests from the plan's verification table: group general chat & unauthorized member -> no dispatch; query self-chat jobId from group -> no private content; same display name different ID -> no permission; unregistered project -> no Codex start.

## Required evidence (stored under evidence/)

- `router-authz-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
