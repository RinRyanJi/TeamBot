// Secret hygiene (architecture §8): logs/diagnostics must not contain tokens, cookies,
// or full environment dumps.

const SECRET_KEY = /(token|cookie|secret|password|passwd|authorization|api[_-]?key|session|credential)/i;

// Token-shaped substrings to scrub from free text.
const TOKEN_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /gh[oprsu]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
];

export const REDACTED = "[redacted]";

/** Scrub token-shaped substrings from a string. */
export function redactString(s: string): string {
  let out = s;
  for (const re of TOKEN_PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

/**
 * Deep-redact a value for logging/diagnostics:
 * - keys matching secret patterns -> "[redacted]"
 * - any key named "env"/"environment" -> dropped entirely (no full env dumps)
 * - strings -> token-shaped substrings scrubbed
 */
export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (/^env(ironment)?$/i.test(k)) continue; // never emit full environment
      out[k] = SECRET_KEY.test(k) ? REDACTED : redactValue(v);
    }
    return out;
  }
  return value;
}

/** Build a diagnostics object guaranteed free of secrets and env dumps. */
export function buildDiagnostics(input: Record<string, unknown>): Record<string, unknown> {
  return redactValue(input) as Record<string, unknown>;
}
