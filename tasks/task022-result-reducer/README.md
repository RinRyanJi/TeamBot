# task022 — Result reducer: turn fold -> final answer + change list (roadmap B)

- Phase: 2
- Env: local (fully verifiable here)
- Status: pending

## Spec

Reduce a turn's events into one authoritative result: extract final_answer agent text (ignore commentary/deltas), collect files changed (from turn/diff/updated + fileChange items) and commands run (from commandExecution items with exit codes). Idempotent outbox keyed by (turnId, kind) with edit-upsert semantics.

## Acceptance (evidence-based)

Unit tests: reducer picks final_answer over commentary; aggregates file changes and commands; produces a two-tier summary; outbox (turnId,kind) uniqueness prevents duplicate result rows.

## Required evidence (stored under evidence/)

- `result-reducer-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
