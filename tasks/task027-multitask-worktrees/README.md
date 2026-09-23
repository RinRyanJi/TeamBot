# task027 — Optional multi-task via additional threads + git worktrees (roadmap G)

- Phase: post
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Allow opt-in parallel tasks by binding additional Codex threads to isolated git worktrees; project lock ensures same project never runs twice concurrently. Default remains single resident thread.

## Acceptance (evidence-based)

Unit tests: worktree allocator assigns isolated dirs; scheduler runs different projects in parallel while serializing same-project; default single-thread unchanged.

## Required evidence (stored under evidence/)

- `multitask-test.txt`

## Result

Completed (opt-in; default single-thread unchanged). `src/supervisor/worktrees.ts`:
`WorktreeAllocator` assigns unique isolated paths (`<root>\.worktrees\<jobId>`) + release;
`MultiTaskScheduler(worktreeRoot, maxConcurrent=1)` combines `JobQueue` (cap + per-project
lock) with worktree allocation — `startNext` activates an eligible job and allocates its
worktree, `finish` releases both. (Creating/removing the actual `git worktree` at the path
is a runtime step for the caller.)

Real verification (`evidence/multitask-test.txt`): 4/4 — allocator uniqueness + release;
default cap=1 serial (resident behavior preserved); cap=2 different projects run in parallel
with distinct worktrees; same project never concurrent even above the cap. Full suite green.

Commit: recorded on push (see git log).
