# task020 — Default AgentHub workspace for !tb (D:\AgentHub)

- Phase: 1
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Establish a default personal-assistant workspace at D:\AgentHub and register it as the default project so !tb has a default startup folder. Ensure the folder exists; register a normalized absolute cwd.

## Acceptance (evidence-based)

Tests: default workspace constant points to an absolute D:\AgentHub; registerDefaults registers it in the ProjectRegistry; ensureWorkspace creates the folder; folder exists on disk.

## Required evidence (stored under evidence/)

- `defaults-test.txt`
- `workspace-listing.txt`

## Result

Completed. `src/app/defaults.ts`:
- `DEFAULT_PROJECT_ID = "AgentHub"`, `DEFAULT_WORKSPACE_PATH = D:\AgentHub` (normalized absolute).
- `ensureWorkspace()` creates `D:\AgentHub` + `projects/ data/ logs/`.
- `registerDefaults(registry)` registers `AgentHub` as the default project so `!tb` has a default startup folder.
- Created the real `D:\AgentHub` (with `projects/ data/ logs/` + README) as the personal-assistant data area.

Real verification: `defaults-test.txt` 4/4 (absolute AgentHub path; registerDefaults registers alias; ensureWorkspace builds the tree; the real `D:\AgentHub` exists on disk); `workspace-listing.txt` shows the created folder tree.

Note: `!tb run` still names a project; AgentHub is the default alias/cwd. A future
"implicit default project when omitted" convenience can build on this.

Commit: recorded on push (see git log).
