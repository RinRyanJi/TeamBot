// Approval lifecycle (architecture §5). An approval code is bound to the original
// operation, Codex request id, thread/turn, user and conversation; it is time-limited
// and single-use. Rejections (unknown/expired/used/wrong-conversation/not-authorized)
// never mutate turn state — a bad approval attempt cannot affect the running work.
import type { Store, Approval, Job } from "../storage/store.ts";
import { randomBytes } from "node:crypto";

export interface ApprovalContext {
  senderId: string;
  chatId: string;
  now: number;
  admins?: string[];
  getJob: (jobId: string) => Job | undefined;
}

export type ResolveResult =
  | { ok: true; approval: Approval }
  | {
      ok: false;
      reason:
        | "unknown"
        | "expired"
        | "used"
        | "wrong-conversation"
        | "not-authorized";
    };

export interface ApprovalManagerOptions {
  ttlMs?: number;
  /** Injectable code generator for deterministic tests. */
  genCode?: () => string;
}

export class ApprovalManager {
  private store: Store;
  private ttlMs: number;
  private genCode: () => string;

  constructor(store: Store, opts: ApprovalManagerOptions = {}) {
    this.store = store;
    this.ttlMs = opts.ttlMs ?? 120_000;
    this.genCode = opts.genCode ?? defaultCodeGen();
  }

  create(params: {
    jobId: string;
    requestId: string;
    threadId?: string | null;
    turnId?: string | null;
    scope?: string | null;
    userId: string;
    chatId: string;
    now: number;
  }): string {
    const code = this.genCode();
    this.store.createApproval({
      code,
      jobId: params.jobId,
      requestId: params.requestId,
      threadId: params.threadId ?? null,
      turnId: params.turnId ?? null,
      scope: params.scope ?? null,
      userId: params.userId,
      chatId: params.chatId,
      status: "pending",
      createdAt: params.now,
      expiresAt: params.now + this.ttlMs,
      usedAt: null,
    });
    return code;
  }

  resolve(
    code: string,
    decision: "approve" | "deny",
    ctx: ApprovalContext,
  ): ResolveResult {
    const approval = this.store.getApproval(code);
    if (!approval) return { ok: false, reason: "unknown" };

    // Already consumed (approved/denied) or previously expired: one-time only.
    if (approval.status !== "pending") return { ok: false, reason: "used" };

    if (ctx.now > approval.expiresAt) {
      this.store.setApprovalStatus(code, "expired");
      return { ok: false, reason: "expired" };
    }

    // Must be resolved from the SAME conversation the approval was issued in.
    if (approval.chatId !== ctx.chatId) {
      return { ok: false, reason: "wrong-conversation" };
    }

    // Only the job initiator or a designated admin may resolve it.
    const job = ctx.getJob(approval.jobId);
    const initiator = job?.senderId === ctx.senderId;
    const admin = (ctx.admins ?? []).includes(ctx.senderId);
    if (!initiator && !admin) return { ok: false, reason: "not-authorized" };

    this.store.setApprovalStatus(
      code,
      decision === "approve" ? "approved" : "denied",
      ctx.now,
    );
    return { ok: true, approval };
  }
}

function defaultCodeGen(): () => string {
  // The code is still bound to task/thread/turn/chat/sender, but an unpredictable
  // value prevents concurrent approvals from being guessable in a shared tenant.
  return () => `A${randomBytes(3).toString("hex").toUpperCase()}`;
}
