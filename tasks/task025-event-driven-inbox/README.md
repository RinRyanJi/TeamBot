# task025 — Event-driven Teams inbox via MutationObserver (roadmap E)

- Phase: 3
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Replace read-polling with a MutationObserver in the Teams page that pushes new-message events to the host (exposeBinding/CDP), with a monotonic cursor and dedupe; keep a slow poll as a safety net.

## Acceptance (evidence-based)

Integration test (real browser/electron): injecting a new message node triggers a pushed event with the new message id; dedupe prevents reprocessing; falls back to poll if binding unavailable.

## Required evidence (stored under evidence/)

- `event-inbox-test.txt`

## Result

Completed. `PlaywrightTeamsAdapter.watchMessages(onMessage)` installs a **MutationObserver**
in the app-owned page (via `page.exposeBinding("__teambotPush", …)` + an observer script
built as a string, so no DOM lib types are needed). Baseline messages are seeded as "seen";
only genuinely new `[data-mid]` nodes fire, deduped by a Set. The existing `readMessages`
remains as a slow-poll safety net.

Real verification (`evidence/event-inbox-test.txt`): a **real Electron host over CDP** —
after `watchMessages`, injecting a new message node pushed exactly one event with the new
id + sender + text; re-injecting a node with an existing baseline id was **deduped** (not
pushed). Ran live, `skipped 0`. Full suite green.

Commit: recorded on push (see git log).
