// Restart / reconnect recovery (architecture §7).
// - History is never re-run: dedup + baseline live in the store, so re-delivered
//   old messages are ignored after a restart (verified in task004/014).
// - Jobs interrupted by process loss are marked 'unknown' and left for reconciliation;
//   they are NOT blindly re-run.
// - The outbox survives restart: pending replies are flushed on reconnect; a send whose
//   outcome is uncertain is retained as 'unknown' rather than blindly resent.
import type { Store } from "../storage/store.ts";
import type { TeamsTransport } from "../transports/teams/transport.ts";

const IN_FLIGHT = new Set([
  "starting",
  "running",
  "waiting_input",
  "waiting_approval",
  "stopping",
]);

export interface ReconciledJob {
  jobId: string;
  from: string;
}

/**
 * On startup, any job that was in flight when the previous process died cannot be
 * trusted to still be running. Mark it 'unknown' so the operator/reconciler decides,
 * instead of assuming success or silently restarting it.
 */
export function markProcessLossUnknown(store: Store): ReconciledJob[] {
  const out: ReconciledJob[] = [];
  for (const jobId of store.listJobIds()) {
    const job = store.getJob(jobId);
    if (job && IN_FLIGHT.has(job.status)) {
      store.updateJobStatus(jobId, "unknown");
      out.push({ jobId, from: job.status });
    }
  }
  return out;
}

export interface OutboxReconcileResult {
  sent: number;
  uncertain: number;
}

/**
 * Flush pending outbox rows to the (reconnected) transport. Confirmed sends are
 * marked 'sent'; uncertain sends are retained as 'unknown' for later verification.
 */
export async function reconcileOutbox(
  store: Store,
  transport: TeamsTransport,
  now: () => number,
): Promise<OutboxReconcileResult> {
  let sent = 0;
  let uncertain = 0;
  for (const row of store.listPendingOutbox(transport.chatId())) {
    try {
      await transport.sendMessage(row.body);
      store.setOutboxStatus(row.id, "sent", now());
      sent += 1;
    } catch {
      store.setOutboxStatus(row.id, "unknown");
      uncertain += 1;
    }
  }
  return { sent, uncertain };
}

/**
 * Offline gap notice (architecture §7): describe the window during which remote
 * control was unavailable so the user is told, rather than failing silently.
 */
export function offlineGapNotice(fromMs: number, toMs: number): string {
  return `這段期間（${fromMs} 至 ${toMs}）離線；期間訊息依收件規則核對，未確認時序者標為待重新確認，不自動補跑。`;
}
