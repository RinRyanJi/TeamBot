# Live Teams harness (user-run)

Automated tests cover the local role and persistence policy in `tests/user-cases-v4.test.ts` (UC-08). Real tenant/phone verification is intentionally not performed by the agent because it would send messages to a user's Teams account.

Run the desktop app with a disposable test pairing. First use the local console's
「登記／編輯專案」 form to register the projects used by the test (for example
`TeamBot` and `CodexWeb`), restart the runtime so it loads `projects.json`, and then
execute these steps from the phone:

If the isolated Teams partition needs setup, run
`npx electron tasks/task018-phase0-live-teams/evidence/harness/phase0-live.cjs --login`
once, complete login in that window, open the disposable self-chat and group, and
close it. For ID discovery, keep the default visible harness open while opening one
target conversation; it only reads the DOM and does not send messages. Do not use the
normal Chrome/Edge profile because its cookies are intentionally not shared.

1. In the selected group, send `!tb projects`; confirm only the configured project list is shown.
2. As a viewer, send `!tb run TeamBot list files`; confirm the request is denied and no Codex turn starts.
3. As an operator, send `!tb focus TeamBot`, then `!tb overview`; confirm the reply is a summary card in the group.
4. Send a dangerous operation that creates an approval; confirm the group receives only a pending-summary notice and the approval detail arrives in the owner's self-chat.
5. From a different chat, try `!tb task <id>`; confirm cross-conversation isolation.
6. Disconnect/reconnect Teams, then send `!tb overview`; confirm the offline/recovery state and task/project IDs remain visible.

## Acceptance record

Fill only the last column with short, redacted observations. Do not paste chat text,
display names, tokens, cookies, message exports, or screenshots into this file.

| Gate | Required observation | Result |
|---|---|---|
| Project selection | `!tb projects` shows only the projects bound to the group | |
| Unauthorized member | Viewer request is denied and no Codex turn is created | |
| Group summary | Operator focus/overview shows Project + Task summary only | |
| Private approval | Group gets a pending notice; approval detail appears only in owner self-chat | |
| Conversation isolation | A task from another chat cannot be queried or mutated | |
| Phone recovery | After reconnect, overview keeps Project/Task identity and reconciliation state | |

Record the date, tenant alias (never tokens/cookies), chat labels, observed replies, and screenshots outside Git. Paste the redacted observations below and change Status to LIVE-VERIFIED after review.

Read-only preflight observed 2026-10-03: the isolated Electron Teams session was already authenticated (`authenticated:true`, URL `https://teams.cloud.microsoft/`), but no target chat was open, so stable chat/message/sender IDs were not available. No message was sent and the live acceptance steps were not claimed.

Status: PENDING USER-RUN
