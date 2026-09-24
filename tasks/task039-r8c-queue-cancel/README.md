# task039 — R8c: queue visibility + cancel

- Phase: G1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Second task while one runs → queued with position reported; !tb 取消 <n> removes one queued item; !tb 取消 全部 / 清空 clears all queued without touching the running one.

## Acceptance (evidence-based)

Tests: position reported; single/all cancel; running job unaffected.

## Required evidence (stored under evidence/)

- `queue-cancel-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
