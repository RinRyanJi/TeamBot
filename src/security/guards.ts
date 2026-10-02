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

// --- Command blacklist (R7b) -------------------------------------------------
// IMPORTANT (PRD §6.2): this is a DEFENCE-IN-DEPTH layer, not an unbreakable wall.
// Regex on a command string cannot reliably stop an adversary (base64/-EncodedCommand,
// variable splicing, aliases, newlines all bypass it). A match therefore ESCALATES the
// operation to must-ask / isolate — it is NOT claimed to block. The structural ceiling
// is the path wall + default read-only + networkAccess=false (see §6.1), which do not
// rely on string matching.
const DESTRUCTIVE =
  /\b(rm\s+-rf|rmdir\s+\/s|del\s+\/[sq]|format|mkfs|dd\s+if=|diskpart|cipher\s+\/w|shutdown|reboot|reg\s+(add|delete)|schtasks|sc\s+(create|delete)|New-Service|takeown|fsutil|Remove-Item\s+.*-Recurse)\b/i;
const NETWORK =
  /\b(curl|wget|ssh|scp|nc|ncat|Invoke-WebRequest|iwr|git\s+push|npm\s+publish|pip\s+install|npm\s+install|yarn\s+add|Invoke-RestMethod)\b/i;
const SECRET =
  /(\.env\b|\.ssh\b|id_rsa|\.git-credentials|GH_TOKEN|AWS_SECRET|private[_-]?key|keychain|credential)/i;
const ELEVATION = /\b(sudo|runas|Start-Process\s+.*-Verb\s+RunAs|net\s+user|icacls|wmic)\b/i;
const GIT_REWRITE = /\bgit\s+(push\s+.*--force|push\s+-f|reset\s+--hard|rebase|filter-branch|clean\s+-[a-z]*x[a-z]*f?d?)\b/i;
// Download-and-execute pipelines and encoded/eval execution.
const DOWNLOAD_EXEC =
  /(\|\s*(bash|sh|iex|Invoke-Expression)\b|Invoke-Expression|\biex\b|certutil\s+.*-(decode|urlcache)|-EncodedCommand|FromBase64String)/i;
// Turning protections off.
const DEFENSE_EVASION =
  /(Set-ExecutionPolicy\s+(Unrestricted|Bypass)|Set-MpPreference|DisableRealtimeMonitoring|netsh\s+advfirewall|Add-MpPreference\s+.*-ExclusionPath|attrib\s+.*\+h)/i;

export type DangerClass =
  | "destructive"
  | "network"
  | "secret"
  | "elevation"
  | "git-rewrite"
  | "download-exec"
  | "defense-evasion";

/** Classify an operation string (command line or scope). Empty array = safe. */
export function classifyDanger(op: string): DangerClass[] {
  if (!op) return [];
  const out: DangerClass[] = [];
  if (DESTRUCTIVE.test(op)) out.push("destructive");
  if (NETWORK.test(op)) out.push("network");
  if (SECRET.test(op)) out.push("secret");
  if (ELEVATION.test(op)) out.push("elevation");
  if (GIT_REWRITE.test(op)) out.push("git-rewrite");
  if (DOWNLOAD_EXEC.test(op)) out.push("download-exec");
  if (DEFENSE_EVASION.test(op)) out.push("defense-evasion");
  return out;
}

/**
 * True if the op matches the blacklist and must therefore be ESCALATED to a human
 * (must-ask / isolate) — it can never be silently allowed or added to a whitelist.
 * NB: a false result does NOT mean "safe to run", only "not on the blacklist".
 */
export function mustEscalate(op: string): boolean {
  return classifyDanger(op).length > 0;
}

/** @deprecated use {@link mustEscalate}. Kept for back-compat with earlier callers. */
export function isAlwaysApprove(op: string): boolean {
  return mustEscalate(op);
}
