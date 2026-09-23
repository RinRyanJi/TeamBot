# task021 — Security defaults: switchable read-only posture, path allow-list, always-approve, redaction

- Phase: 2
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Roadmap A from product-brainstorm. Default execution posture read-only; !tb unlock <duration> switches to workspace-write until expiry; !tb lock relocks; !tb kill hard-stops. Path allow-list confines writes to AgentHub (canonicalized; reject .., UNC, symlink escape, absolute-outside). always-approve classifier flags destructive/network/secret/elevation ops. Redact outbound Teams messages. Wire posture + commands into the resident runner.

## Acceptance (evidence-based)

Unit tests: SecurityPolicy default read-only, unlock opens workspace-write until expiry then reverts, lock relocks; isPathAllowed confines to root; isAlwaysApprove flags destructive/network/secret/elevation; outbound redaction scrubs tokens. Parser recognizes unlock/lock/kill. Full suite green.

## Required evidence (stored under evidence/)

- `security-test.txt`
- `parser-security-test.txt`

## Result

Completed (roadmap A; posture decision = "both, switchable").
- `src/security/policy.ts` — `SecurityPolicy` default **read-only**; `unlock(ms,now)` → workspace-write until expiry (auto-reverts); `lock()` reverts; `kill()` forces read-only permanently; `effectiveSandbox(now)` computed against the clock.
- `src/security/guards.ts` — `isPathAllowed(root,target)` confines to AgentHub (rejects `..`/absolute-outside/UNC); `classifyDanger`/`isAlwaysApprove` flag destructive/network/secret/elevation/git-rewrite ops.
- Parser: `!tb`/`@tb` `unlock [minutes]` / `lock` / `kill` recognized; router allows them for allowlisted (owner).
- Resident runner wired: per-turn `sandboxPolicy` from posture — read-only `{type:readOnly,networkAccess:false}` or `{type:workspaceWrite, writableRoots:[AgentHub], networkAccess:false}` (writes confined to AgentHub + network denied); `unlock/lock/kill` commands live; Codex result **redacted** before posting to Teams.

Real verification: `security-test.txt` 6/6 (default read-only; unlock→expiry→revert; lock/kill; path confinement; danger classifier; outbound redaction); `parser-security-test.txt` full parser suite passes incl. unlock/lock/kill. Full suite 110/110.

Commit: recorded on push (see git log).
