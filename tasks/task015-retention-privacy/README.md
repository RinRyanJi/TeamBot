# task015 — Data retention/deletion and secret hygiene (arch §8)

- Phase: 3
- Env: local (fully verifiable here)
- Status: pending

## Spec

Implement TTL-based retention for audit/approval/cache/jobs, batch delete per conversation/job, and ensure logs/diagnostics exclude token/cookie/full env.

## Acceptance (evidence-based)

Tests: expired records purged per TTL; batch delete removes a job's approvals/events/cache; log redaction verified.

## Required evidence (stored under evidence/)

- `retention-test.txt`
- `redaction-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
