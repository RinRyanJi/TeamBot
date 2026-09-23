// Inbox intake: dedup + pairing baseline (architecture §7 "收件").
// - Dedup by (tenant, chatId, messageId): a message is processed at most once.
// - Baseline: at first pairing we record baselineAt; messages at/before it are
//   history and are recorded but never dispatched (no executing old history).
// - Edited old messages keep their messageId, so re-delivery dedups to a no-op.
import type { Store, InboxMessage, Pairing } from "../storage/store.ts";

export type IntakeDecision =
  | { accepted: true }
  | { accepted: false; reason: "duplicate" | "before-baseline" | "no-pairing" };

export class Inbox {
  // NB: no TS "parameter properties" — Node's --experimental-strip-types is
  // erasable-syntax-only. Declare the field explicitly.
  private store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  /**
   * Record and classify an incoming message. Accepted messages are recorded and
   * left un-dispatched for the caller to route and then markDispatched().
   */
  intake(msg: InboxMessage, pairing: Pairing | undefined): IntakeDecision {
    if (!pairing) return { accepted: false, reason: "no-pairing" };

    // Record first so duplicates (incl. re-delivered edits) are detected exactly once.
    const isNew = this.store.insertInboxIfNew(msg);
    if (!isNew) return { accepted: false, reason: "duplicate" };

    // History guard: at/before the baseline captured at pairing time.
    if (pairing.baselineAt != null && msg.receivedAt <= pairing.baselineAt) {
      return { accepted: false, reason: "before-baseline" };
    }

    return { accepted: true };
  }
}
