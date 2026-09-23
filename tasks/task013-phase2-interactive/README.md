# task013 — Phase 2 interactive control: continue/steer/stop/approve/deny/answer

- Phase: 2
- Env: local (fully verifiable here)
- Status: pending

## Spec

Add continue, steer, stop, approve, deny, answer with idempotent inbox, duplicate/expired approval handling, stop-vs-actually-stopped distinction, approval codes bound per §5.

## Acceptance (evidence-based)

Tests: mid-run query/steer/answer; wrong-source/expired approval rejected without affecting the turn; stopping vs cancelled distinguished; dangerous-op approval routed to self-chat.

## Required evidence (stored under evidence/)

- `phase2-interactive-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
