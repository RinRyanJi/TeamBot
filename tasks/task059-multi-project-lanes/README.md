# task059 — Multi-project execution lanes and worktree UX

- Phase: P1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Expose global concurrency, per-project main-lane locking, explicit worktree fork, queue reasons, and merge-pending state. Different projects may run concurrently within a configured cap; same-project parallel work requires isolation.

## Acceptance (evidence-based)

Tests prove different-project scheduling, same-project serialization, explicit fork confirmation, isolated worktree identity, queue visibility, and no shared-main-workspace concurrent writes.

## Required evidence (stored under evidence/)

- `lane-scheduler-test.txt`

## Result

_Fill in when complete._
