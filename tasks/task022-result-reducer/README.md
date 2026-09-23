# task022 — Result reducer: turn fold -> final answer + change list (roadmap B)

- Phase: 2
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Reduce a turn's events into one authoritative result: extract final_answer agent text (ignore commentary/deltas), collect files changed (from turn/diff/updated + fileChange items) and commands run (from commandExecution items with exit codes). Idempotent outbox keyed by (turnId, kind) with edit-upsert semantics.

## Acceptance (evidence-based)

Unit tests: reducer picks final_answer over commentary; aggregates file changes and commands; produces a two-tier summary; outbox (turnId,kind) uniqueness prevents duplicate result rows.

## Required evidence (stored under evidence/)

- `result-reducer-test.txt`

## Result

Completed. `src/progress/result-reducer.ts`: `reduceTurn(turnId, events)` folds normalized
`TurnEvent`s into `{finalText, files, commands}` — final_answer beats commentary/deltas,
diff snapshot overrides fileChange counts, commands aggregated; `formatResult` renders the
two-tier verdict+details and flags failed commands. Idempotency: `sent_results(turnId PK)`
table + `Store.markResultSent`/`resultAlreadySent` guarantee one authoritative result per turn.

Real verification (`evidence/result-reducer-test.txt`): 5/5 — final_answer selection,
fallback to last message, file aggregation + diff override, two-tier formatting with
failed-command flag, and one-result-per-turn idempotency. Full suite green.

Commit: recorded on push (see git log).
