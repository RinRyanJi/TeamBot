# task056 — PRD v4: project-first multi-project UX and user cases

- Phase: P0
- Env: local (documentation and consistency checks)
- Status: DONE

## Spec

Replace the single-resident-AgentHub product mental model with Project → Task → Session → Turn. Specify project profiles, active conversation context, overview, task-first commands, multi-project execution rules, notification levels, approvals, recovery, and evidence-based user cases.

## Acceptance (evidence-based)

PRD v4 and User Cases v4 are linked from README; at least ten user cases cover onboarding, ambiguity, multi-project execution, approval, interruption, groups, recovery, handoff, and artifacts; v3 documents are marked historical and new priorities are traceable.

## Required evidence (stored under evidence/)

- `spec-review.md`

## Result

Completed. The canonical product documents are [PRD-v4.md](../../docs/PRD-v4.md) and [user-cases-v4.md](../../docs/user-cases-v4.md). The v4 model makes Project, Task, Session, and Turn separate user-facing concepts, moves cross-project overview and ambiguity handling to P0, and moves isolated multi-project lanes to P1. Existing v3 documents are explicitly marked historical.
