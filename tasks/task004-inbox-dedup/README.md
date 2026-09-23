# task004 — Inbox dedup and pairing baseline

- Phase: 1
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Dedup incoming messages by (tenant/account, chatId, messageId); establish baseline at first pairing so history is not executed; edited old messages do not trigger new jobs.

## Acceptance (evidence-based)

Tests: same message read twice -> dispatched once; message before baseline -> ignored; edited old message -> no new job.

## Required evidence (stored under evidence/)

- `inbox-dedup-test.txt`

## Result

Completed. `src/router/inbox.ts` `Inbox.intake(msg, pairing)` classifies each message:
- **duplicate** — dedup by (tenant,chatId,messageId) via `INSERT OR IGNORE`; processed at most once.
- **before-baseline** — messages at/before `pairing.baselineAt` (captured at first pairing) are history, recorded but never dispatched. Added `baselineAt` column to the pairings schema.
- **no-pairing** — unpaired chats never dispatch.
- Edited old messages keep their messageId, so re-delivery dedups to a no-op.

Also hardened the toolchain: enabled `erasableSyntaxOnly` in tsconfig so TS-only
constructs unsupported by Node's strip-types mode (e.g. parameter properties) fail
typecheck instead of at runtime.

Real verification (`evidence/inbox-dedup-test.txt`): 5/5 tests — same message twice → dispatched once; at/before baseline → ignored (after baseline → accepted); edited old message → no new job; no pairing → rejected; history re-render after restart → not re-dispatched. Full suite 18/18.

Commit: recorded on push (see git log).
