# task029 — R0b: notification economics + GO/PIVOT decision

- Phase: G0
- Env: live (requires user's real Teams tenant/phone)
- Status: pending

## Spec

Measure on a real phone: (1) does a NEW message push; (2) does editing the same message 3x push again; (3) does high-frequency editing within 60s accumulate into a push or trigger throttling. Decide GO (edit does not push) vs PIVOT (edit pushes).

## Acceptance (evidence-based)

Live observation log; GO/PIVOT conclusion written back into PRD §0.

## Required evidence (stored under evidence/)

- `notification-economics.md`
- `decision.md`

## Result

_Fill in when complete: commit hash, what was verified, and how._
