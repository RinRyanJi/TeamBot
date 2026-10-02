import { PREFIXES, REPORT_PREFIX, isJobId } from "./parser.ts";

export type V4Command =
  | { kind: "overview" }
  | { kind: "focus"; projectId: string }
  | { kind: "run"; projectId?: string; request: string }
  | { kind: "task"; jobId: string }
  | { kind: "add"; jobId?: string; request: string }
  | { kind: "fork"; jobId: string; request: string }
  | { kind: "watch"; jobId: string; mode: "watch" | "mute" }
  | { kind: "cancel"; jobId: string }
  | { kind: "handoff"; jobId: string };

export type V4ParseResult =
  | { ok: true; command: V4Command }
  | { ok: false; reason: "not-a-command" | "unknown-command" | "missing-args" | "bad-id" };

function words(raw: string): string[] {
  return raw.trim().split(/\s+/).filter(Boolean);
}
/**
 * Project-first grammar. `knownProjects` is used only to disambiguate
 * `run <project> <request>` from `run <request>`; it never accepts a cwd.
 */
export function parseV4Command(raw: string, knownProjects: readonly string[] = []): V4ParseResult {
  const text = raw.trimStart();
  if (text.startsWith(REPORT_PREFIX)) return { ok: false, reason: "not-a-command" };
  const parts = words(text);
  const prefix = parts[0]?.toLowerCase();
  if (!prefix || !PREFIXES.includes(prefix as (typeof PREFIXES)[number])) return { ok: false, reason: "not-a-command" };
  const sub = (parts[1] ?? "").toLowerCase();
  const rest = parts.slice(2);
  void knownProjects;
  switch (sub) {
    case "overview":
    case "dashboard":
    case "?":
      return { ok: true, command: { kind: "overview" } };
    case "focus": {
      const projectId = rest[0];
      return projectId ? { ok: true, command: { kind: "focus", projectId } } : { ok: false, reason: "missing-args" };
    }
    case "run": {
      if (rest.length === 0) return { ok: false, reason: "missing-args" };
      const candidate = rest[0]!;
      if (candidate === "--") {
        const request = rest.slice(1).join(" ").trim();
        return request ? { ok: true, command: { kind: "run", request } } : { ok: false, reason: "missing-args" };
      }
      // A two-or-more word form keeps the historical `run <project> <text>`
      // grammar and lets the coordinator return a safe unknown-project error.
      // Use `run -- <text>` when the request itself begins with a project-like
      // word, or omit `run` and write natural language directly after !tb.
      if (rest.length > 1) {
        return { ok: true, command: { kind: "run", projectId: candidate, request: rest.slice(1).join(" ") } };
      }
      return { ok: true, command: { kind: "run", request: rest.join(" ") } };
    }
    case "task":
    case "details": {
      const jobId = rest[0];
      if (!jobId) return { ok: false, reason: "missing-args" };
      if (!isJobId(jobId)) return { ok: false, reason: "bad-id" };
      return { ok: true, command: { kind: "task", jobId } };
    }
    case "add": {
      const maybeJob = rest[0];
      const request = (maybeJob && isJobId(maybeJob) ? rest.slice(1) : rest).join(" ").trim();
      if (!request) return { ok: false, reason: "missing-args" };
      if (maybeJob && isJobId(maybeJob)) return { ok: true, command: { kind: "add", jobId: maybeJob, request } };
      return { ok: true, command: { kind: "add", request } };
    }
    case "fork": {
      const jobId = rest[0];
      const request = rest.slice(1).join(" ").trim();
      if (!jobId || !request) return { ok: false, reason: "missing-args" };
      if (!isJobId(jobId)) return { ok: false, reason: "bad-id" };
      return { ok: true, command: { kind: "fork", jobId, request } };
    }
    case "watch":
    case "mute": {
      const jobId = rest[0];
      if (!jobId) return { ok: false, reason: "missing-args" };
      if (!isJobId(jobId)) return { ok: false, reason: "bad-id" };
      return { ok: true, command: { kind: "watch", jobId, mode: sub } };
    }
    case "cancel":
    case "stop": {
      const jobId = rest[0];
      if (!jobId) return { ok: false, reason: "missing-args" };
      if (!isJobId(jobId)) return { ok: false, reason: "bad-id" };
      return { ok: true, command: { kind: "cancel", jobId } };
    }
    case "handoff": {
      const jobId = rest[0];
      if (!jobId) return { ok: false, reason: "missing-args" };
      if (!isJobId(jobId)) return { ok: false, reason: "bad-id" };
      return { ok: true, command: { kind: "handoff", jobId } };
    }
    default:
      // Natural language after the prefix is a run request. A bare known
      // command still falls through as unknown so old strict parser behaviour
      // remains unchanged.
      if (sub && !["help", "projects", "status", "result", "continue", "steer", "approve", "deny", "answer", "kill", "lock", "unlock"].includes(sub)) {
        return { ok: true, command: { kind: "run", request: parts.slice(1).join(" ") } };
      }
      return { ok: false, reason: "unknown-command" };
  }
}
