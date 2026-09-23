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
| **Inbound receive path** | ✅ YES | `--watch` (baseline then poll) detected a user-sent message with stable messageId + senderId. |
| **Background update while HIDDEN** | ✅ YES | The `--watch` window ran `show:false` (hidden) and still received the new message — the §5 "hidden surface still receives" item. |

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

- Self-chat + one group **bound simultaneously** (dual-surface). Deferred by user (no test group yet); single-surface background reception is already proven.
- Same-account **phone push** notification behavior (needs the phone; separate from us receiving).

## Phase-0 decision

**GO for the browser-automation transport.** All critical feasibility unknowns are
resolved on the real tenant: tenant login/conditional access (with a supported-browser UA),
stable chatId/messageId/senderId extraction, the **send** path (compose→send→reconcile),
the **receive** path, and **background reception on a hidden surface**. The only unverified
items — simultaneous dual-surface and same-account phone-push notification — are non-blocking
follow-ups (single-surface send+receive+background all work; dual-surface is more of the same
bound a second time).
