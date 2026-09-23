import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/storage/store.ts";
import type { Pairing, InboxMessage } from "../src/storage/store.ts";
import { Inbox } from "../src/router/inbox.ts";

const baseAt = 1_700_000_000_000;

function pairedStore(): { store: Store; inbox: Inbox; pairing: Pairing } {
  const store = new Store();
  const pairing: Pairing = {
    id: "p1",
    tenant: "t1",
    account: "me@x",
    chatId: "c1",
    kind: "self",
    allowlist: ["u1"],
    projects: ["TeamBot"],
    baselineMessageId: "m0",
    baselineAt: baseAt,
    createdAt: baseAt,
  };
  store.upsertPairing(pairing);
  return { store, inbox: new Inbox(store), pairing };
}

function msg(id: string, receivedAt: number, text = "!tb run TeamBot go"): InboxMessage {
  return { tenant: "t1", chatId: "c1", messageId: id, senderId: "u1", text, receivedAt };
}

test("same message read twice -> dispatched once", () => {
  const { inbox, pairing } = pairedStore();
  const m = msg("m1", baseAt + 100);
  assert.deepEqual(inbox.intake(m, pairing), { accepted: true });
  assert.deepEqual(inbox.intake(m, pairing), { accepted: false, reason: "duplicate" });
});

test("message at/before baseline is history -> not accepted", () => {
  const { inbox, pairing } = pairedStore();
  assert.deepEqual(inbox.intake(msg("old1", baseAt - 1), pairing), {
    accepted: false,
    reason: "before-baseline",
  });
  assert.deepEqual(inbox.intake(msg("old2", baseAt), pairing), {
    accepted: false,
    reason: "before-baseline",
  });
  assert.deepEqual(inbox.intake(msg("new1", baseAt + 1), pairing), { accepted: true });
});

test("edited old message (same id, new text) does not trigger a new job", () => {
  const { inbox, pairing } = pairedStore();
  assert.deepEqual(inbox.intake(msg("m1", baseAt + 100, "original"), pairing), {
    accepted: true,
  });
  // Teams edit keeps the same messageId; re-delivery dedups to a no-op.
  assert.deepEqual(inbox.intake(msg("m1", baseAt + 200, "edited text"), pairing), {
    accepted: false,
    reason: "duplicate",
  });
});

test("no pairing -> rejected (never dispatch from unpaired chats)", () => {
  const { inbox } = pairedStore();
  assert.deepEqual(inbox.intake(msg("m9", baseAt + 100), undefined), {
    accepted: false,
    reason: "no-pairing",
  });
});

test("history re-render after restart is not re-dispatched", () => {
  const { inbox, store, pairing } = pairedStore();
  const m = msg("m5", baseAt + 500);
  assert.deepEqual(inbox.intake(m, pairing), { accepted: true });
  store.markDispatched("t1", "c1", "m5");
  // Teams re-renders the same history on reconnect:
  assert.deepEqual(inbox.intake(m, pairing), { accepted: false, reason: "duplicate" });
});
