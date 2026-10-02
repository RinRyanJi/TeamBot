# task060 — Group project context and role UX revalidation

- Phase: P1
- Env: live (requires user's real Teams tenant/phone)
- Status: pending

## Spec

Revalidate the group scenario against v4: explicit project context, member roles, source conversation binding, summary-only group output, and private routing for high-risk approvals.

## Acceptance (evidence-based)

User-run live evidence covers group project selection, unauthorized member denial, cross-conversation isolation, private approval routing, and phone-visible recovery behavior.

## Required evidence (stored under evidence/)

- `group-project-live.md`

## Result

Local policy and persistence tests are complete. Live tenant/phone revalidation remains pending and must be run with the supplied harness; no real Teams messages were sent by automated verification. See [group-project-live.md](evidence/group-project-live.md).
