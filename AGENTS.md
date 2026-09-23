# TeamBot

## User preferences
- Work in this repository; reference ../codex-chatgpt-web for its Electron browser architecture without modifying that project.
- After completing and verifying requested updates, commit and push to https://github.com/RinRyanJi/TeamBot.git. The user has authorized this workflow. Never force-push.
- Use the gh account RinRyanJi for GitHub authentication, as explicitly requested by the user. Never persist or print credentials.
- Keep Teams profiles, cookies, chat data, screenshots, and secrets out of Git.

## Current phase
- Architecture planning only. The user explicitly corrected the scope: TeamBot lets a user operate Codex CLI and receive progress through Teams on a phone.
- Both same-account self-chat and selected group chats are required for the first version.
- Do not implement an ordinary keyword auto-reply bot. Agree on the architecture before implementation.
- Read docs/architecture.md and docs/implementation-plan.md before future development.
- Reference source may be copied into an independent TeamBot implementation after design review; preserve upstream MIT notices for copied code.
- No runnable application has been implemented yet.

## Planned boundaries
- Electron shell and Teams WebContentsView remain isolated; remote pages receive no preload or Node integration.
- Playwright operates only on the app-owned Teams view. Do not attach to the user's regular browser.
- Teams carries requests and status; a local supervisor manages Codex sessions and execution.
- Test messaging using a local fixture first. Do not send real Teams messages as incidental verification.
