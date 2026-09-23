# task025 — Event-driven Teams inbox via MutationObserver (roadmap E)

- Phase: 3
- Env: local (fully verifiable here)
- Status: pending

## Spec

Replace read-polling with a MutationObserver in the Teams page that pushes new-message events to the host (exposeBinding/CDP), with a monotonic cursor and dedupe; keep a slow poll as a safety net.

## Acceptance (evidence-based)

Integration test (real browser/electron): injecting a new message node triggers a pushed event with the new message id; dedupe prevents reprocessing; falls back to poll if binding unavailable.

## Required evidence (stored under evidence/)

- `event-inbox-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
