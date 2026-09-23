# task024 — Approval registry: code<->requestId, timeouts, steer (roadmap D)

- Phase: 2
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Registry binding Teams approval code <-> Codex server-request id; supports multiple pending, expiry (timeout -> pause/auto-decline, never auto-approve), requestUserInput answers, and steer-vs-new-turn routing. Distinguish command/file/permissions request kinds and their response shapes.

## Acceptance (evidence-based)

Unit tests: bind+resolve by code; multiple pending distinct codes; expiry auto-declines; unknown/duplicate rejected; requestUserInput answered by id; decision shapes correct per kind.

## Required evidence (stored under evidence/)

- `approval-registry-test.txt`

## Result

Completed. `src/router/approval-registry.ts` `ApprovalRegistry`: binds Teams code (A1…)
↔ Codex server-request id; `kindFromMethod` classifies command/file/permissions/input;
`resolveApproval(code, accept)` and `answerInput(code, text)` return the bound requestId +
decision/text (caller builds the concrete Codex response shape, keeping the registry
decoupled from wire schemas). Multiple pending tracked; expiry rejects late resolves;
`sweepExpired` returns overdue pendings so the caller auto-declines (never auto-approves).

Real verification (`evidence/approval-registry-test.txt`): 7/7 — method→kind mapping;
distinct codes + resolve returns bound id; used/unknown rejected; expiry rejection +
sweep-once; sweepExpired yields overdue for auto-decline; answerInput only for input kind;
multiple pending distinct. Full suite green.

Commit: recorded on push (see git log).
