# TeamBot

## User preferences
- Work in this repository; reference ../codex-chatgpt-web for its Electron browser architecture without modifying that project.
- After completing and verifying requested updates, commit and push to https://github.com/RinRyanJi/TeamBot.git. The user has authorized this workflow. Never force-push.
- Use the gh account RinRyanJi for GitHub authentication, as explicitly requested by the user. Never persist or print credentials.
- Keep Teams profiles, cookies, chat data, screenshots, and secrets out of Git.

## Current phase
- Implementation in progress. The architecture is agreed; the user directed building it out task by task with real, evidence-backed verification.
- Work is decomposed in `tasks/` (see `tasks/README.md`). Each task is completed with real evidence stored under its `evidence/` folder, then committed/pushed individually.
- TeamBot lets a user operate Codex CLI and receive progress through Teams on a phone. Both same-account self-chat and selected group chats are required for the first version.
- Do not implement an ordinary keyword auto-reply bot.
- Read docs/architecture.md and docs/implementation-plan.md before development.
- Reference source may be copied into the independent TeamBot implementation; preserve upstream MIT notices for copied code (record provenance).
- env=live tasks (real Teams tenant/phone) cannot be self-verified headlessly; provide a harness for the user to run. Do not send real Teams messages as incidental verification.

## Planned boundaries
- Electron shell and Teams WebContentsView remain isolated; remote pages receive no preload or Node integration.
- Playwright operates only on the app-owned Teams view. Do not attach to the user's regular browser.
- Teams carries requests and status; a local supervisor manages Codex sessions and execution.
- Test messaging using a local fixture first. Do not send real Teams messages as incidental verification.
