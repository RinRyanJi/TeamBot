# task014 — Phase 3 restart/reconnect/checkpoint recovery

- Phase: 3
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Teams re-login, browser reload, checkpoint recovery; outbox reconciliation, send-status-unknown, process-loss, approval-wait recovery; offline recovery notice (arch §7).

## Acceptance (evidence-based)

Tests: restart does not re-run history nor misroute results; unrecoverable jobs clearly marked; Teams offline but job done -> result held in outbox, reconciled on recovery.

## Required evidence (stored under evidence/)

- `phase3-resilience-test.txt`

## Result

Completed. `src/supervisor/recovery.ts`:
- `markProcessLossUnknown(store)` — on restart, in-flight jobs (starting/running/
  waiting_*/stopping) become `unknown` for reconciliation; terminal jobs untouched; nothing auto-reruns.
- `reconcileOutbox(store, transport, now)` — flush pending replies to the reconnected transport; confirmed → `sent`, uncertain → retained `unknown` (no blind resend).
- `offlineGapNotice(from,to)` — user-facing offline-window notice (§7). Added `Store.listJobIds`.

Real verification (`evidence/phase3-resilience-test.txt`): 4/4 — using a **file-backed
SQLite reopened to simulate a restart**, re-delivered history dedups to `duplicate`
(not re-run); in-flight jobs marked `unknown` (terminal untouched); a reply produced
while the transport was offline stays in the outbox and is delivered on reconnect
(result not lost, not misrouted — bound to its chatId); offline-gap notice names the
window. Full suite 72/72.

Commit: recorded on push (see git log).
