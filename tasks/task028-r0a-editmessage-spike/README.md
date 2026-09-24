# task028 — R0a: CDP editMessage feasibility spike

- Phase: G0
- Env: live (requires user's real Teams tenant/phone)
- Status: pending

## Spec

In the real tenant over CDP, programmatically edit a message you just sent (by data-mid) and read it back to confirm the content changed. Verify whether data-mid stays stable after an edit (if not, the heartbeat locator key drifts).

## Acceptance (evidence-based)

Live evidence: before/after DOM content of the same data-mid; a note on data-mid stability. This gates H.

## Required evidence (stored under evidence/)

- `editmessage-spike.md`
- `before-after.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
