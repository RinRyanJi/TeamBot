// Transactional outbox (architecture §7 "派工與回報").
// Segments are enqueued atomically. Sending is not exactly-once: a send whose
// result is uncertain is marked 'unknown' and retained for later reconciliation
// rather than blindly resent.
import type { Store } from "../storage/store.ts";
import { segmentMessage } from "./progress.ts";

export class Outbox {
  private store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  /** Segment a message and enqueue all parts atomically. Returns the row ids. */
  enqueueMessage(
    jobId: string,
    chatId: string,
    seq: number,
    body: string,
    at: number,
    maxLen?: number,
  ): number[] {
    const segments = segmentMessage(jobId, seq, body, maxLen);
    return this.store.transaction(() =>
      segments.map((seg) =>
        this.store.enqueueOutbox({
          jobId,
          chatId,
          seq: seg.seq,
          part: seg.part,
          body: seg.body,
          createdAt: at,
        }),
      ),
    );
  }

  pending(chatId?: string) {
    return this.store.listPendingOutbox(chatId);
  }

  /** Confirmed delivered. */
  markSent(id: number, at: number): void {
    this.store.setOutboxStatus(id, "sent", at);
  }

  /** Delivery result uncertain — kept for reconciliation, not resent blindly. */
  markUnknown(id: number): void {
    this.store.setOutboxStatus(id, "unknown");
  }

  /** Rows whose send outcome is unknown, for reconciliation on reconnect. */
  unknown(chatId?: string) {
    return this.store.listOutboxByStatus("unknown", chatId);
  }
}
