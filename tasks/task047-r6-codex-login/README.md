# task047 — R6: !tb login/logout + no-turn-when-unauthed

- Phase: G3
- Env: local (fully verifiable here)
- Status: pending

## Spec

Codex device login/logout; when not logged in do not start a turn and do not fail silently — say 'Codex not logged in' and offer login.

## Acceptance (evidence-based)

Tests: unauthed turn intercepted with a clear message.

## Required evidence (stored under evidence/)

- `login-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
