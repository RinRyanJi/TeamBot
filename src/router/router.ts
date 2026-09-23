// Router authorization (architecture §5 permission table).
// Identity is established by stable sender id within a paired conversation — never
// by display name or chat title. Work requests never self-authorize: permission is
// decided here from the desktop-configured pairing (allowlist, projects, admins)
// and job ownership, before anything reaches Codex.
import type { Command } from "./parser.ts";
import type { Job, Pairing } from "../storage/store.ts";

export interface RouteContext {
  /** Pairing for the SOURCE conversation, matched by (tenant, chatId) upstream. */
  pairing: Pairing;
  /** Stable sender id of the incoming message (not display name). */
  senderId: string;
  /** Desktop-designated admins for this conversation. */
  admins?: string[];
  /** Look up a job by id (for ownership / cross-conversation checks). */
  getJob: (jobId: string) => Job | undefined;
}

export type AuthDecision =
  | { allow: true }
  | {
      allow: false;
      reason:
        | "not-allowlisted"
        | "project-not-authorized"
        | "unknown-job"
        | "cross-conversation"
        | "not-initiator";
    };

const isAllowlisted = (ctx: RouteContext): boolean =>
  ctx.pairing.allowlist.includes(ctx.senderId);

const isAdmin = (ctx: RouteContext): boolean =>
  (ctx.admins ?? []).includes(ctx.senderId);

/** A job the sender may act on: must exist and belong to the source conversation. */
function resolveOwnedJob(
  ctx: RouteContext,
  jobId: string,
): { job: Job } | { deny: Extract<AuthDecision, { allow: false }> } {
  const job = ctx.getJob(jobId);
  if (!job) return { deny: { allow: false, reason: "unknown-job" } };
  // Never reveal or act on another conversation's job (no cross-conversation jobId probing).
  if (job.chatId !== ctx.pairing.chatId) {
    return { deny: { allow: false, reason: "cross-conversation" } };
  }
  return { job };
}

export function authorize(command: Command, ctx: RouteContext): AuthDecision {
  // Every command requires an allowlisted sender in the paired conversation.
  if (!isAllowlisted(ctx)) return { allow: false, reason: "not-allowlisted" };

  switch (command.kind) {
    case "help":
    case "projects":
      return { allow: true };

    case "run": {
      if (!ctx.pairing.projects.includes(command.projectId)) {
        return { allow: false, reason: "project-not-authorized" };
      }
      return { allow: true };
    }

    // Query: any allowlisted member of the SAME conversation.
    case "status":
    case "result": {
      const r = resolveOwnedJob(ctx, command.jobId);
      return "deny" in r ? r.deny : { allow: true };
    }

    // Control: initiator or designated admin, within the same conversation.
    case "continue":
    case "steer":
    case "stop":
    case "approve":
    case "deny":
    case "answer": {
      const jobId = "jobId" in command ? command.jobId : undefined;
      // approve/deny/answer are keyed by approval/question ids resolved elsewhere;
      // when a jobId is present we enforce ownership here.
      if (jobId === undefined) return { allow: true };
      const r = resolveOwnedJob(ctx, jobId);
      if ("deny" in r) return r.deny;
      const initiator = r.job.senderId === ctx.senderId;
      if (!initiator && !isAdmin(ctx)) {
        return { allow: false, reason: "not-initiator" };
      }
      return { allow: true };
    }
  }
}
