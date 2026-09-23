// TeamBot entry module.
// Operate Codex CLI from mobile Microsoft Teams and receive progress.
// See docs/architecture.md and docs/implementation-plan.md.

export const TEAMBOT_VERSION = "0.0.1";

/** Pinned Codex CLI version this project targets (architecture §3). */
export const PINNED_CODEX_CLI_VERSION = "0.156.1";

export function describeTeamBot(): string {
  return "TeamBot operates Codex CLI from mobile Microsoft Teams and returns progress.";
}
