# task058 — Cross-project overview and task-first status cards

- Phase: P0
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Add overview/task/details reducers and presentation. Group active, waiting, queued, completed, and offline work by project; every card includes project name and human task ID.

## Acceptance (evidence-based)

Fixture tests render one-screen overview, task details, action-required states, and no fabricated percentage or ETA. Status can be read without starting a Codex turn.

## Required evidence (stored under evidence/)

- `overview-status-test.txt`

## Result

Completed. Overview and task-card reducers group jobs by project, show actionable state, and avoid invented ETA/percentage fields. See [overview-status-test.txt](evidence/overview-status-test.txt).
