// Desktop console logic (architecture §5/§8) — the testable core behind the UI.
// The desktop registers project aliases with NORMALIZED ABSOLUTE paths (the phone
// can only name an alias, never submit a cwd), and establishes a pairing baseline so
// pre-existing history is never executed.
import { isAbsolute, normalize } from "node:path";
import type { ProjectRegistry } from "./projects.ts";

/** Normalize a project path; reject non-absolute paths (no ambiguous cwd). */
export function normalizeProjectPath(input: string): string {
  const trimmed = input.trim();
  if (!isAbsolute(trimmed)) {
    throw new Error(`project path must be absolute: ${input}`);
  }
  return normalize(trimmed);
}

/** Register a project alias with a normalized absolute cwd. */
export function registerProject(
  registry: ProjectRegistry,
  projectId: string,
  path: string,
): void {
  if (!projectId.trim()) throw new Error("projectId required");
  registry.register({ projectId, cwd: normalizeProjectPath(path) });
}

export interface Baseline {
  baselineMessageId: string | null;
  baselineAt: number;
}

/**
 * Establish the pairing baseline from the currently-visible messages: everything at
 * or before this point is history and will not be executed (architecture §7).
 */
export function createBaseline(
  messages: Array<{ messageId: string; receivedAt: number }>,
  now: number,
): Baseline {
  if (messages.length === 0) {
    return { baselineMessageId: null, baselineAt: now };
  }
  let latest = messages[0]!;
  for (const m of messages) if (m.receivedAt > latest.receivedAt) latest = m;
  return { baselineMessageId: latest.messageId, baselineAt: latest.receivedAt };
}
