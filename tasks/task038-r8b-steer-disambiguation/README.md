# task038 — R8b: steer wiring + add-vs-new disambiguation

- Phase: G1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Mid-turn plain text → turn/steer folds into current turn; attachments queue as next turn; ambiguous → ask 併/新. steer text is never treated as an approval.

## Acceptance (evidence-based)

Tests: steer folds in; disambiguation routes correctly; steer != approval.

## Required evidence (stored under evidence/)

- `steer-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
