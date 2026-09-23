# task006 — Router: identity check, allowlist, per-conversation binding, permission table

- Phase: 1
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Route only verified !tb messages. Enforce group member allowlist, per-conversation binding, and the §5 permission table (start/query/continue-stop/approve-answer/admin).

## Acceptance (evidence-based)

Tests from the plan's verification table: group general chat & unauthorized member -> no dispatch; query self-chat jobId from group -> no private content; same display name different ID -> no permission; unregistered project -> no Codex start.

## Required evidence (stored under evidence/)

- `router-authz-test.txt`

## Result

Completed. `src/router/router.ts` `authorize(command, ctx)` implements the §5
permission table. Identity is the stable sender id within a paired conversation
(never display name/title). Every command requires an allowlisted sender; `run`
also requires the project be authorized for that conversation; query (status/result)
requires the job belong to the SAME conversation (no cross-conversation jobId probing);
control (continue/steer/stop/approve/deny/answer) requires initiator or designated admin.

Real verification (`evidence/router-authz-test.txt`): 8/8 — non-allowlisted member
cannot start; allowlisted+authorized project can; unregistered project → no start;
group querying a self-chat jobId → `cross-conversation`; same-conversation query allowed
for any allowlisted member; only initiator/admin may stop/continue/steer; unknown job
refused; display-name spoof gains nothing (id-based). Full suite 35/35.

Note: scope-bound approval-code checks (expiry/one-time) are task013; this task covers
the identity/ownership/permission gate.

Commit: recorded on push (see git log).
