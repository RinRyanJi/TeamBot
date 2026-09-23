// Data retention (architecture §8). TTLs are configurable; these are the defaults.
// Purging removes rows older than their TTL; jobs cascade to their events/approvals/outbox.
import type { Store } from "./store.ts";

export interface RetentionPolicy {
  /** approvals + question history */
  approvalsMs: number;
  /** chat message cache / dedup keys (inbox) */
  cacheMs: number;
  /** jobs (and their events/approvals/outbox) */
  jobsMs: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  approvalsMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  cacheMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  jobsMs: 30 * 24 * 60 * 60 * 1000, // 30 days
};

export interface PurgeResult {
  approvals: number;
  inbox: number;
  jobs: number;
}

export function purgeExpired(
  store: Store,
  now: number,
  policy: RetentionPolicy = DEFAULT_RETENTION,
): PurgeResult {
  return {
    approvals: store.purgeOlderThan("approvals", "createdAt", now - policy.approvalsMs),
    inbox: store.purgeOlderThan("inbox", "receivedAt", now - policy.cacheMs),
    jobs: store.purgeOlderThan("jobs", "createdAt", now - policy.jobsMs),
  };
}
