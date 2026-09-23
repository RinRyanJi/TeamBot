# task024 — Approval registry: code<->requestId, timeouts, steer (roadmap D)

- Phase: 2
- Env: local (fully verifiable here)
- Status: pending

## Spec

Registry binding Teams approval code <-> Codex server-request id; supports multiple pending, expiry (timeout -> pause/auto-decline, never auto-approve), requestUserInput answers, and steer-vs-new-turn routing. Distinguish command/file/permissions request kinds and their response shapes.

## Acceptance (evidence-based)

Unit tests: bind+resolve by code; multiple pending distinct codes; expiry auto-declines; unknown/duplicate rejected; requestUserInput answered by id; decision shapes correct per kind.

## Required evidence (stored under evidence/)

- `approval-registry-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
