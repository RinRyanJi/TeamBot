# task007 — Codex app-server stdio adapter (initialize/thread/turn/steer/interrupt)

- Phase: 0/1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Client that spawns codex app-server over stdio, performs initialize/initialized handshake, thread/start & thread/resume, turn/start, reads item/turn events, turn/steer with expectedTurnId, turn/interrupt, and answers approval/input requests.

## Acceptance (evidence-based)

Integration test performs a real handshake against codex-cli 0.156.1 in an isolated temp dir and observes at least one turn lifecycle; interrupt is honored. (Falls back to documented skip with reason if codex not available at runtime.)

## Required evidence (stored under evidence/)

- `codex-handshake-test.txt`
- `codex-turn-lifecycle.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
