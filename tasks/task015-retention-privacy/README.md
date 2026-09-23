# task015 — Data retention/deletion and secret hygiene (arch §8)

- Phase: 3
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Implement TTL-based retention for audit/approval/cache/jobs, batch delete per conversation/job, and ensure logs/diagnostics exclude token/cookie/full env.

## Acceptance (evidence-based)

Tests: expired records purged per TTL; batch delete removes a job's approvals/events/cache; log redaction verified.

## Required evidence (stored under evidence/)

- `retention-test.txt`
- `redaction-test.txt`

## Result

Completed.
- `src/storage/retention.ts` — `purgeExpired(store, now, policy)` with `DEFAULT_RETENTION` (approvals 30d, cache/inbox 14d, jobs 30d); purging a job cascades to its events/approvals/outbox.
- `Store` gains `deleteJob` (cascade), `deleteConversation` (jobs+events+approvals+inbox+outbox+pairing), `purgeOlderThan`, and `count`.
- `src/util/redact.ts` — `redactString`/`redactValue`/`buildDiagnostics`: scrubs token-shaped substrings (Bearer/GitHub/Slack/JWT), redacts secret-named keys, and drops `env`/`environment` entirely (no full env dumps).

Real verification: `evidence/retention-test.txt` 3/3 — deleteJob removes job+children;
deleteConversation clears a chat entirely; TTL purge removes old job (cascaded) + old
inbox cache while keeping fresh rows. `evidence/redaction-test.txt` 3/3 — tokens scrubbed
from strings, secret keys redacted, `env` dropped, and diagnostics contain no bearer
token / env / credential value. Full suite 78/78.

Commit: recorded on push (see git log).
