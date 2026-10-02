# task056 evidence — specification review

Verified locally on 2026-10-03:

- `docs/PRD-v4.md` exists and defines Project → Task → Session → Turn, project profiles, conversation context, multi-project lanes, overview/status cards, approvals, recovery, metrics, and release milestones.
- `docs/user-cases-v4.md` exists with 12 user cases: onboarding, explicit focus, multi-project queue/parallel work, worktree fork, overview/details, approvals, steer/stop, group roles, offline recovery, desktop handoff, ambiguity clarification, and artifacts.
- `README.md` links both v4 documents and reports implementation-in-progress status.
- `docs/PRD.md` and `docs/plan-v3.md` contain an explicit v4 canonical-spec notice.
- `docs/product-brainstorm.md` points its existing three-scenario design to the v4 Project-first model.
- `tasks/manifest.json` and `tasks/README.md` include task056 and the follow-up implementation tasks 057–060.

Commands:

```text
git diff --check
rg -n "PRD-v4|user-cases-v4|Project.*Task.*Session.*Turn" README.md docs tasks
```

`npm test` passed (179 tests) and `npm run typecheck` passed. The v4-specific suite is exposed as `npm run test:v4` and passed 46 tests, including coordinator routing, recovery, result folding, task details, partial-completion status and all 12 User Cases v4 fixtures.

The review is documentation-only. No live Teams message was sent and no task execution behavior was changed.
