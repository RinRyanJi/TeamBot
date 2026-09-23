# task004 — Inbox dedup and pairing baseline

- Phase: 1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Dedup incoming messages by (tenant/account, chatId, messageId); establish baseline at first pairing so history is not executed; edited old messages do not trigger new jobs.

## Acceptance (evidence-based)

Tests: same message read twice -> dispatched once; message before baseline -> ignored; edited old message -> no new job.

## Required evidence (stored under evidence/)

- `inbox-dedup-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
