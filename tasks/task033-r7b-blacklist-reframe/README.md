# task033 — R7b: blacklist reframed as escalate-to-ask + adversarial tests

- Phase: G1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Change blacklist from 'claims to block' to 'match → escalate to must-ask/isolate'. Fill missing patterns (diskpart, Set-ExecutionPolicy, takeown, fsutil, wmic, certutil -decode). Add positive + adversarial negatives per class (case, spaces, quote-splicing, PS aliases, -EncodedCommand, backticks).

## Acceptance (evidence-based)

Per-class tests pass; wording in §9 threat table corrected (no 'reliable block' claim).

## Required evidence (stored under evidence/)

- `blacklist-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
