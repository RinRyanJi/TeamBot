// Fixed parser for !tb control commands (architecture §4).
// Control commands are parsed by this fixed grammar; work requests (run/continue/
// steer/answer free text) are passed verbatim to Codex, never re-interpreted for
// permissions. Report lines (starting with "[TB") are never treated as commands,
// so TeamBot's own messages in a self-chat cannot loop back as input.

export const PREFIX = "!tb";
/** Accepted command prefixes (case-insensitive). Both !tb and @tb work. */
export const PREFIXES = ["!tb", "@tb"] as const;
export const REPORT_PREFIX = "[TB";

// ID naming (architecture §4): T=job, A=approval, Q=question. Case-insensitive.
const JOB_ID = /^T\d+$/i;
const APPROVAL_ID = /^A[A-Z0-9]+$/i;
const QUESTION_ID = /^Q[A-Z0-9]+$/i;

export const isJobId = (s: string): boolean => JOB_ID.test(s);
export const isApprovalId = (s: string): boolean => APPROVAL_ID.test(s);
export const isQuestionId = (s: string): boolean => QUESTION_ID.test(s);

export type Command =
  | { kind: "help" }
  | { kind: "projects" }
  | { kind: "run"; projectId: string; request: string }
  | { kind: "status"; jobId: string }
  | { kind: "continue"; jobId: string; request: string }
  | { kind: "steer"; jobId: string; request: string }
  | { kind: "stop"; jobId: string }
  | { kind: "approve"; code: string }
  | { kind: "deny"; code: string }
  | { kind: "answer"; questionId: string; text: string }
  | { kind: "result"; jobId: string };

export type ParseResult =
  | { ok: true; command: Command }
  | {
      ok: false;
      reason:
        | "not-a-command"
        | "unknown-command"
        | "missing-args"
        | "bad-id";
    };

/** Split on runs of whitespace, dropping empties. */
function tokens(s: string): string[] {
  return s.trim().split(/\s+/).filter((t) => t.length > 0);
}

export function parseCommand(raw: string): ParseResult {
  const text = raw.trimStart();

  // Never treat TeamBot's own reports as commands.
  if (text.startsWith(REPORT_PREFIX)) return { ok: false, reason: "not-a-command" };

  const toks = tokens(text);
  const first = toks[0];
  if (!first || !PREFIXES.includes(first.toLowerCase() as (typeof PREFIXES)[number])) {
    return { ok: false, reason: "not-a-command" };
  }

  const sub = (toks[1] ?? "").toLowerCase();
  const rest = toks.slice(2);

  switch (sub) {
    case "":
      return { ok: false, reason: "unknown-command" };
    case "help":
      return { ok: true, command: { kind: "help" } };
    case "projects":
      return { ok: true, command: { kind: "projects" } };

    case "run": {
      const projectId = rest[0];
      const request = rest.slice(1).join(" ");
      if (!projectId || request.length === 0) {
        return { ok: false, reason: "missing-args" };
      }
      return { ok: true, command: { kind: "run", projectId, request } };
    }

    case "status":
    case "stop":
    case "result": {
      const id = rest[0];
      if (!id) return { ok: false, reason: "missing-args" };
      if (!isJobId(id)) return { ok: false, reason: "bad-id" };
      return { ok: true, command: { kind: sub, jobId: id } };
    }

    case "continue":
    case "steer": {
      const id = rest[0];
      const request = rest.slice(1).join(" ");
      if (!id || request.length === 0) return { ok: false, reason: "missing-args" };
      if (!isJobId(id)) return { ok: false, reason: "bad-id" };
      return { ok: true, command: { kind: sub, jobId: id, request } };
    }

    case "approve":
    case "deny": {
      const code = rest[0];
      if (!code) return { ok: false, reason: "missing-args" };
      if (!isApprovalId(code)) return { ok: false, reason: "bad-id" };
      return { ok: true, command: { kind: sub, code } };
    }

    case "answer": {
      const id = rest[0];
      const answerText = rest.slice(1).join(" ");
      if (!id || answerText.length === 0) return { ok: false, reason: "missing-args" };
      if (!isQuestionId(id)) return { ok: false, reason: "bad-id" };
      return { ok: true, command: { kind: "answer", questionId: id, text: answerText } };
    }

    default:
      return { ok: false, reason: "unknown-command" };
  }
}

/**
 * Like parseCommand, but treats `!tb <free text>` (an unrecognized subcommand) as an
 * implicit `run` in the default project. So `!tb 創建一個 doc 資料夾` == run in AgentHub
 * with that request. Known control commands (help/run/status/approve/...) are unchanged.
 */
export function parseWithImplicitRun(
  raw: string,
  defaultProjectId: string,
): ParseResult {
  const strict = parseCommand(raw);
  if (strict.ok) return strict;
  if (strict.reason === "unknown-command") {
    const toks = tokens(raw.trimStart());
    // toks[0] is the !tb prefix; the rest is the free-text request.
    const request = toks.slice(1).join(" ").trim();
    if (request.length > 0) {
      return { ok: true, command: { kind: "run", projectId: defaultProjectId, request } };
    }
  }
  return strict;
}
