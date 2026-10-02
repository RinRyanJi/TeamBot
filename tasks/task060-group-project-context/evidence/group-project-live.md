# Live Teams harness (user-run)

Automated tests cover the local role and persistence policy in `tests/user-cases-v4.test.ts` (UC-08). Real tenant/phone verification is intentionally not performed by the agent because it would send messages to a user's Teams account.

Run the desktop app with a disposable test pairing and then execute these steps from the phone:

1. In the selected group, send `!tb projects`; confirm only the configured project list is shown.
2. As a viewer, send `!tb run TeamBot list files`; confirm the request is denied and no Codex turn starts.
3. As an operator, send `!tb focus TeamBot`, then `!tb overview`; confirm the reply is a summary card in the group.
4. Send a dangerous operation that creates an approval; confirm the group receives only a pending-summary notice and the approval detail arrives in the owner's self-chat.
5. From a different chat, try `!tb task <id>`; confirm cross-conversation isolation.
6. Disconnect/reconnect Teams, then send `!tb overview`; confirm the offline/recovery state and task/project IDs remain visible.

Record the date, tenant alias (never tokens/cookies), chat labels, observed replies, and screenshots outside Git. Paste the redacted observations below and change Status to LIVE-VERIFIED after review.

Status: PENDING USER-RUN
