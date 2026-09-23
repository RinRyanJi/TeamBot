// Approval/question registry for the resident runner (product-brainstorm roadmap D).
// Binds a short Teams code (A1, A2, …) to a Codex server-request id, supports multiple
// pending, expiry (timeout -> auto-decline; never auto-approve), and both approval
// decisions and free-text answers (requestUserInput). It stays decoupled from Codex
// response schemas: it returns {requestId, kind, accept|text}; the caller builds the
// concrete response payload.

export type RequestKind = "command" | "file" | "permissions" | "input" | "unknown";

export function kindFromMethod(method: string): RequestKind {
  if (method.includes("commandExecution")) return "command";
  if (method.includes("fileChange")) return "file";
  if (method.includes("permissions")) return "permissions";
  if (method.includes("requestUserInput")) return "input";
  return "unknown";
}

interface Entry {
  code: string;
  requestId: number;
  kind: RequestKind;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "resolved" | "expired";
}

export type ResolveResult =
  | { ok: true; requestId: number; kind: RequestKind; accept: boolean }
  | { ok: false; reason: "unknown" | "used" | "expired" };

export type AnswerResult =
  | { ok: true; requestId: number; text: string }
  | { ok: false; reason: "unknown" | "used" | "expired" | "not-input" };

export interface ExpiredItem {
  code: string;
  requestId: number;
  kind: RequestKind;
}

export class ApprovalRegistry {
  private ttlMs: number;
  private seq = 0;
  private byCode = new Map<string, Entry>();
  private genCode: () => string;

  constructor(ttlMs = 30 * 60_000, genCode?: () => string) {
    this.ttlMs = ttlMs;
    this.genCode = genCode ?? (() => "A" + ++this.seq);
  }

  /** Register a server->client request; returns its code + kind. */
  register(requestId: number, method: string, now: number): { code: string; kind: RequestKind } {
    const code = this.genCode();
    const kind = kindFromMethod(method);
    this.byCode.set(code, {
      code,
      requestId,
      kind,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      status: "pending",
    });
    return { code, kind };
  }

  private check(code: string, now: number): Entry | { reason: "unknown" | "used" | "expired" } {
    const e = this.byCode.get(code);
    if (!e) return { reason: "unknown" };
    if (e.status !== "pending") return { reason: "used" };
    if (now > e.expiresAt) {
      e.status = "expired";
      return { reason: "expired" };
    }
    return e;
  }

  /** Resolve an approval (command/file/permissions) with accept/decline. */
  resolveApproval(code: string, accept: boolean, now: number): ResolveResult {
    const r = this.check(code, now);
    if ("reason" in r) return { ok: false, reason: r.reason };
    r.status = "resolved";
    return { ok: true, requestId: r.requestId, kind: r.kind, accept };
  }

  /** Answer a requestUserInput with free text. */
  answerInput(code: string, text: string, now: number): AnswerResult {
    const r = this.check(code, now);
    if ("reason" in r) return { ok: false, reason: r.reason };
    if (r.kind !== "input") return { ok: false, reason: "not-input" };
    r.status = "resolved";
    return { ok: true, requestId: r.requestId, text };
  }

  pending(now: number): Entry[] {
    return [...this.byCode.values()].filter((e) => e.status === "pending" && now <= e.expiresAt);
  }

  /** Mark all overdue pending entries expired; return them so the caller can auto-decline. */
  sweepExpired(now: number): ExpiredItem[] {
    const out: ExpiredItem[] = [];
    for (const e of this.byCode.values()) {
      if (e.status === "pending" && now > e.expiresAt) {
        e.status = "expired";
        out.push({ code: e.code, requestId: e.requestId, kind: e.kind });
      }
    }
    return out;
  }
}
