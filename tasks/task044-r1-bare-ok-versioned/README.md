# task044 — R1: bare ok bound to versioned pending queue

- Phase: G3
- Env: local (fully verifiable here)
- Status: pending

## Spec

Approval target decided by TeamBot's versioned pending queue; a new pending bumps the version and invalidates a prior bare ok (degrades to a report). Reference carries data only.

## Acceptance (evidence-based)

Race tests: delayed ok hits old vs new pending; invalidation on state change.

## Required evidence (stored under evidence/)

- `bare-ok-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
