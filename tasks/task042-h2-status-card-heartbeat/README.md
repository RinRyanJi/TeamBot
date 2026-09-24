# task042 — H2: in-place status card + Codex-event-driven heartbeat (3-state)

- Phase: G2
- Env: local (fully verifiable here)
- Status: pending

## Spec

One message morphs (⏳ → doing → conclusion). Heartbeat driven by Codex app-server events, not setInterval; distinguishes progressing / idle / channel-dead. Stuck warning N default 3 min, configurable.

## Acceptance (evidence-based)

Tests: three-state transitions; stuck-warning fake-clock test.

## Required evidence (stored under evidence/)

- `status-heartbeat-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
