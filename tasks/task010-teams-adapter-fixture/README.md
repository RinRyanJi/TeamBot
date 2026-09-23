# task010 — Playwright Teams adapter against a local fixture page

- Phase: 0/1
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Playwright adapter that reads new messages, confirms conversation identity, serializes sends and reconciles results — driven against a local HTML fixture emulating the Teams DOM (stable chat/message/sender IDs).

## Acceptance (evidence-based)

Playwright test against the fixture: reads a new message, extracts (chatId, messageId, senderId), sends a reply, reconciles it. Serialized single-writer verified.

## Required evidence (stored under evidence/)

- `teams-fixture-test.txt`

## Result

Completed.
- `src/transports/teams/transport.ts` — `TeamsTransport` interface (chatId/readMessages/sendMessage/close) + `TeamsMessage`, so the real surface and a fake are interchangeable (used by task012).
- `src/transports/teams/playwright-adapter.ts` — `PlaywrightTeamsAdapter` drives an app-owned page via playwright-core: reads stable (chatId, messageId, senderId, text) from the DOM, and serializes sends through a single write-chain (one writer) with send→reconcile-by-id.
- `tests/fixtures/teams-fixture.html` — local Teams DOM fixture with stable data-chat-id / data-message-id / data-sender-id.

Real verification (`evidence/teams-fixture-test.txt`): a **real browser** (installed
Chrome via playwright-core) ran live (`skipped 0`) — extracted the chat id and both
message sender ids, sent a reply and reconciled it by id (author `me@fixture`), and
confirmed single-writer ordering for two concurrent sends (first appears before second).
Full suite 54/54, 0 skipped (this + the real codex handshake both ran live).

Note: this uses installed Chrome to avoid a browser download; production binds to the
app's isolated Teams WebContentsView (task011). Stable-id availability on the real
Teams DOM is a task018 (live) verification.

### Real Teams selectors wired in (post-Phase-0)
After task018 verified the live Teams DOM, the adapter gained selector **profiles**:
`fixture` and `teams`. The `teams` profile uses the exact selectors verified live —
chatId `[data-track-thread-id]`, message `[data-mid]`, sender `[data-acc-id]`, compose
`[contenteditable][role=textbox]` (send via Enter) — plus a supported desktop Edge UA.
Evidence `teams-v2-adapter-test.txt`: the production adapter drives a `teams-v2-fixture.html`
that mimics the real DOM — reads chatId + stable message/sender ids, sends via
contenteditable+Enter, reconciles by `data-mid`, and preserves single-writer ordering.
Both profiles pass (real Chrome, 0 skipped).

Commit: recorded on push (see git log).
