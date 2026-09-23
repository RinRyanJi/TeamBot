// Progress reporting policy (architecture §6).
// - Important events report immediately (start/complete/fail/waiting_*).
// - Routine progress is coalesced to at most one report per interval (default 30s);
//   no per-token flooding.
// - Long outbound messages are segmented, each part tagged with jobId/seq/part/total.

export const IMPORTANT_KINDS: ReadonlySet<string> = new Set([
  "started",
  "completed",
  "failed",
  "waiting_approval",
  "waiting_input",
  "stopping",
  "cancelled",
]);

export const isImportant = (kind: string): boolean => IMPORTANT_KINDS.has(kind);

export interface ProgressEvent {
  kind: string;
  at: number;
}

/**
 * Decides whether an event should be reported now. Important events always report
 * and reset the routine timer; routine events report only once per interval.
 */
export class ProgressCoalescer {
  private intervalMs: number;
  private lastEmitAt = -Infinity;

  constructor(intervalMs = 30_000) {
    this.intervalMs = intervalMs;
  }

  shouldEmit(ev: ProgressEvent): boolean {
    if (isImportant(ev.kind)) {
      this.lastEmitAt = ev.at;
      return true;
    }
    if (ev.at - this.lastEmitAt >= this.intervalMs) {
      this.lastEmitAt = ev.at;
      return true;
    }
    return false;
  }
}

export interface MessageSegment {
  jobId: string;
  seq: number;
  part: number;
  total: number;
  body: string;
}

/**
 * Split a message body into segments no larger than maxLen, each labelled
 * "[TB <jobId>] (k/n) ...". Short messages become a single unlabelled-count part.
 */
export function segmentMessage(
  jobId: string,
  seq: number,
  body: string,
  maxLen = 1800,
): MessageSegment[] {
  const label = (k: number, n: number) =>
    n > 1 ? `[TB ${jobId}] (${k}/${n}) ` : `[TB ${jobId}] `;

  // First pass: estimate chunks using the multi-part label length as budget.
  const budget = Math.max(1, maxLen - `[TB ${jobId}] (99/99) `.length);
  const chunks: string[] = [];
  for (let i = 0; i < body.length; i += budget) {
    chunks.push(body.slice(i, i + budget));
  }
  if (chunks.length === 0) chunks.push("");

  const total = chunks.length;
  return chunks.map((chunk, idx) => ({
    jobId,
    seq,
    part: idx + 1,
    total,
    body: label(idx + 1, total) + chunk,
  }));
}
