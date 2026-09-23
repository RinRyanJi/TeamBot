// Blast-radius guards (product-brainstorm roadmap A / security brief).
import { resolve, relative, isAbsolute } from "node:path";

/**
 * True only if `target` resolves to a path inside `root` (writes confined to AgentHub).
 * Rejects "..", absolute-outside, and UNC paths. (Symlink escape must additionally be
 * checked at runtime with realpath before writing; this is the static guard.)
 */
export function isPathAllowed(root: string, target: string): boolean {
  if (!target || typeof target !== "string") return false;
  if (target.startsWith("\\\\") || target.startsWith("//")) return false; // UNC
  const resolvedRoot = resolve(root);
  const resolvedTarget = isAbsolute(target) ? resolve(target) : resolve(resolvedRoot, target);
  const rel = relative(resolvedRoot, resolvedTarget);
  // Inside root iff the relative path doesn't climb out and isn't absolute.
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// Operations that MUST always require explicit approval regardless of posture.
const DESTRUCTIVE =
  /\b(rm\s+-rf|rmdir\s+\/s|del\s+\/[sq]|format|mkfs|dd\s+if=|shutdown|reboot|reg\s+(add|delete)|schtasks|sc\s+(create|delete)|New-Service|Remove-Item\s+.*-Recurse)\b/i;
const NETWORK =
  /\b(curl|wget|ssh|scp|nc|ncat|Invoke-WebRequest|iwr|git\s+push|npm\s+publish|pip\s+install|npm\s+install|yarn\s+add|Invoke-RestMethod)\b/i;
const SECRET =
  /(\.env\b|\.ssh\b|id_rsa|\.git-credentials|GH_TOKEN|AWS_SECRET|private[_-]?key|keychain|credential)/i;
const ELEVATION = /\b(sudo|runas|Start-Process\s+.*-Verb\s+RunAs|net\s+user|icacls)\b/i;
const GIT_REWRITE = /\bgit\s+(push\s+.*--force|push\s+-f|reset\s+--hard|rebase|filter-branch)\b/i;

export type DangerClass = "destructive" | "network" | "secret" | "elevation" | "git-rewrite";

/** Classify an operation string (command line or scope). Empty array = safe. */
export function classifyDanger(op: string): DangerClass[] {
  if (!op) return [];
  const out: DangerClass[] = [];
  if (DESTRUCTIVE.test(op)) out.push("destructive");
  if (NETWORK.test(op)) out.push("network");
  if (SECRET.test(op)) out.push("secret");
  if (ELEVATION.test(op)) out.push("elevation");
  if (GIT_REWRITE.test(op)) out.push("git-rewrite");
  return out;
}

/** True if the op must always be approved by a human, regardless of sandbox posture. */
export function isAlwaysApprove(op: string): boolean {
  return classifyDanger(op).length > 0;
}
