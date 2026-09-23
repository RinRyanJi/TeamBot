# task027 — Optional multi-task via additional threads + git worktrees (roadmap G)

- Phase: post
- Env: local (fully verifiable here)
- Status: pending

## Spec

Allow opt-in parallel tasks by binding additional Codex threads to isolated git worktrees; project lock ensures same project never runs twice concurrently. Default remains single resident thread.

## Acceptance (evidence-based)

Unit tests: worktree allocator assigns isolated dirs; scheduler runs different projects in parallel while serializing same-project; default single-thread unchanged.

## Required evidence (stored under evidence/)

- `multitask-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
