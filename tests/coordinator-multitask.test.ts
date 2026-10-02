import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Store, type InboxMessage, type Pairing } from "../src/storage/store.ts";
import { Coordinator } from "../src/app/coordinator.ts";
import { ProjectRegistry } from "../src/app/projects.ts";
import type { TeamsMessage, TeamsTransport } from "../src/transports/teams/transport.ts";
import type { CodexAdapter } from "../src/codex/adapter.ts";

class ConcurrentAdapter extends EventEmitter {
  active = 0;
  maxActive = 0;
  private thread = 0;
  private turn = 0;
  async startThread(): Promise<{ threadId: string }> {
    return { threadId: `thread-${++this.thread}` };
  }
  async startTurn(params: { threadId: string }): Promise<{ turnId: string }> {
    const turnId = `turn-${++this.turn}`;
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    setImmediate(() => {
      this.emit("item/completed", { threadId: params.threadId, turnId, text: params.threadId });
      this.active -= 1;
      this.emit("turn/completed", { threadId: params.threadId, turnId });
    });
    return { turnId };
  }
  async steer(): Promise<void> {}
  async interrupt(): Promise<void> {}
}

class Transport implements TeamsTransport {
  sent: string[] = [];
  private readonly id: string;
  constructor(id: string) { this.id = id; }
  chatId(): string { return this.id; }
  async readMessages(): Promise<TeamsMessage[]> { return []; }
  async sendMessage(text: string): Promise<string> { this.sent.push(text); return `m${this.sent.length}`; }
  async close(): Promise<void> {}
}

const pairing: Pairing = {
  id: "p", tenant: "t", account: "me", chatId: "self", kind: "self",
  allowlist: ["me"], projects: ["A", "B"], createdAt: 1,
};

function message(id: string, text: string): InboxMessage {
  return { tenant: "t", chatId: "self", messageId: id, senderId: "me", text, receivedAt: 10 };
}

test("coordinator runs different projects concurrently when the cap allows it", async () => {
  const store = new Store();
  const projects = new ProjectRegistry();
  projects.register({ projectId: "A", cwd: "D:/a" });
  projects.register({ projectId: "B", cwd: "D:/b" });
  const adapter = new ConcurrentAdapter();
  const transport = new Transport("self");
  const coord = new Coordinator({
    store,
    transport,
    adapter: adapter as unknown as CodexAdapter,
    projects,
    pairing,
    maxConcurrent: 2,
    now: () => 10,
  });
  const p1 = coord.handle(message("m1", "!tb run A inspect"));
  const p2 = coord.handle(message("m2", "!tb run B inspect"));
  const results = await Promise.all([p1, p2]);
  assert.deepEqual(results.map((r) => r.action).sort(), ["ran", "ran"]);
  assert.equal(adapter.maxActive, 2);
  assert.equal(store.getJob("T001")?.status, "completed");
  assert.equal(store.getJob("T002")?.status, "completed");
  store.close();
});

