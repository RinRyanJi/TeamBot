# task018 — Phase 0 LIVE: real tenant login, stable IDs, dual-surface, phone push (user-run)

- Phase: 0
- Env: live (requires user's real Teams tenant/phone)
- Status: HARNESS-DONE (live run: user)

## Spec

Provide a guided harness + checklist for the user to run against their real Teams tenant: verify login/conditional access, stable chat/message/sender IDs, self-chat + one group dual-surface, background updates, reply targeting, same-account phone push behavior. Record go/no-go with fallback per plan.

## Acceptance (evidence-based)

User executes the harness and records results in evidence/results.md (go/no-go + which capabilities verified/blocked). Agent cannot self-verify (requires live tenant + phone; real Teams sends restricted per AGENTS.md).

## Required evidence (stored under evidence/)

- `harness/`
- `results-template.md`

## Result

Harness delivered and self-verified; the LIVE tenant/push run is inherently user-run.
- `evidence/harness/phase0-live.cjs` — Electron harness that opens the app-owned isolated
  Teams surface. Real mode → `https://teams.microsoft.com` (visible; you log in), re-probes
  every 5s, writes `results/phase0-results.json`. `--selfcheck` mode → local fixture.
- `evidence/harness/README.md` — step-by-step live checklist.
- `evidence/results-template.md` — capability matrix + go/no-go with fallbacks.

Real verification of the harness itself (`evidence/selfcheck.txt`): **real Electron**
ran `phase0-live.cjs --selfcheck` and its probe extracted `stableChatId/stableMessageIds/
stableSenderIds = true` from the isolated surface (exit 0); wrapped test 1/1, skipped 0.

**Two-phase login/probe flow (added):** because the surface uses a persistent partition,
you log in ONCE via `--login` (interactive, in the harness window — not the system browser,
which is isolated by design), then `--probe` runs headless/unattended against the
authenticated real Teams DOM and writes `results/phase0-results.json`. Verified now without
a login: `--probe` reaches **real teams.microsoft.com** and correctly reports
`authenticated:false` at `/error/eoa` (exit 4) — it knows when to ask you to log in
(`evidence/probe-flow.txt`). After your one-time `--login`, the same `--probe` yields the
real stable-id findings — at which point the agent CAN record them.

**Not self-verifiable by the agent (by design):** real tenant login / conditional access,
stable IDs on the *real* Teams DOM, dual-surface background updates, reply targeting, and
same-account phone push — these require the user's live tenant + phone, and AGENTS.md
forbids sending real Teams messages as incidental verification. Run the harness per its
README and record go/no-go in `results-template.md`.

Commit: recorded on push (see git log).
