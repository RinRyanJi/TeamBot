# Phase 0 LIVE findings (agent-run against the real tenant)

Date: 2026-09-23. Codex CLI: 0.156.1. Real Teams web: `https://teams.cloud.microsoft/`.
Run via the harness after a one-time in-app `--login` by the user; `--probe` then ran
unattended against the authenticated session. Raw IDs are NOT recorded here (privacy, §8);
they exist only in the local gitignored `results/phase0-results.json`.

## Verified capabilities

| Capability | Result | Evidence |
|---|---|---|
| Tenant login (MFA / conditional access) | ✅ YES | `--probe` reached the authenticated app (title showed the account + an open group chat). |
| Supported-browser gate | ⚠️ requires UA | Default Electron UA was rejected ("classic Teams no longer available"); setting a desktop Edge UA let the real web app + OAuth login load. |
| Stable **chatId** obtainable | ✅ YES | `[data-track-thread-id]` on the open conversation. |
| Stable **messageId** obtainable | ✅ YES | `[data-mid]` per message (10 messages extracted). |
| Stable **senderId** obtainable | ✅ YES | `[data-acc-id]` on/within each message. |
| Chat list enumeration | ✅ (rail present) | Left rail chats are `role=treeitem` (31 seen); folders `UNREAD / TEAMS_AND_CHANNELS / NON_MEETING_CHATS`. |
| Not display-name-only | ✅ | IDs are opaque stable values, not display names. |
| **Reply / send path** | ✅ YES | With user consent, `--sendtest` typed into the compose box and sent (Enter) a marked message into the self-chat, then **reconciled it by `data-mid`** (got messageId + senderId + threadId). |

Thread id formats observed: self-chat = `48:notes…`; group = `19:…` (standard Teams thread prefixes).

## Real Teams v2 selector map (used by the harness probe)

| Field | Selector (real Teams web) |
|---|---|
| chatId / thread | `[data-track-thread-id]` (also `data-track-thread-type` / `-modality`) |
| messageId | `[data-mid]` |
| senderId / author | `[data-acc-id]` |
| message container | `data-tid="chat-pane-message"` / `chat-pane-item` |
| chat list item | `role=treeitem` |
| compose box | `[contenteditable="true"][role="textbox"]` (send via Enter; `insertText` + synthesized Return) |
| content frame | single top frame (`teams.cloud.microsoft`); harness still probes all frames for safety |

## Still pending (user / follow-up)

- Self-chat + one group **bound simultaneously** (dual-surface); background updates while hidden.
- Same-account **phone push** behavior (needs the phone).

## Phase-0 decision (partial)

The critical feasibility unknown — **can stable chat/message/sender IDs be read from the
real Teams web DOM?** — is **GO** (all three obtainable via stable attributes), and tenant
login/conditional access passed with a supported-browser UA. Remaining dual-surface/push
items are follow-ups; none currently blocks the design. Record final go/no-go in
`results-template.md` after the dual-surface + push checks.
