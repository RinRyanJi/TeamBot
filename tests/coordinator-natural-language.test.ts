import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Store, type InboxMessage, type Pairing } from "../src/storage/store.ts";
import { Coordinator } from "../src/app/coordinator.ts";
import { ProjectRegistry } from "../src/app/projects.ts";
import type { CodexAdapter } from "../src/codex/adapter.ts";
import type { TeamsMessage, TeamsTransport } from "../src/transports/teams/transport.ts";

class Adapter extends EventEmitter {
  async startThread(): Promise<{ threadId: string }> { return { threadId: "natural-thread" }; }
  async startTurn(): Promise<{ turnId: string }> {
    setImmediate(() => {
      this.emit("item/completed", { threadId: "natural-thread", turnId: "natural-turn", text: "done" });
      this.emit("turn/completed", { threadId: "natural-thread", turnId: "natural-turn" });
    });
    return { turnId: "natural-turn" };
  }
  async steer(): Promise<void> {}
  async interrupt(): Promise<void> {}
  stop(): void {}
}

class Transport implements TeamsTransport {
  sent: string[] = [];
  chatId(): string { return "self"; }
  async readMessages(): Promise<TeamsMessage[]> { return []; }
  async sendMessage(text: string): Promise<string> { this.sent.push(text); return `m${this.sent.length}`; }
  async close(): Promise<void> {}
}

const pairing: Pairing = {
  id: "self", tenant: "t", account: "me", chatId: "self", kind: "self",
  allowlist: ["me"], projects: ["TeamBot", "Docs"], createdAt: 1,
};
const msg = (id: string, text: string): InboxMessage => ({ tenant: "t", chatId: "self", messageId: id, senderId: "me", text, receivedAt: 10 });

test("focused self-chat accepts plain natural language and keeps the project", async () => {
  const store = new Store();
  const projects = new ProjectRegistry();
  projects.register({ projectId: "TeamBot", cwd: "D:/tb" });
  projects.register({ projectId: "Docs", cwd: "D:/docs" });
  const transport = new Transport();
  const coord = new Coordinator({ store, transport, adapter: new Adapter() as unknown as CodexAdapter, projects, pairing, now: () => 10 });
  const focused = await coord.handle(msg("focus", "!tb focus TeamBot"));
  assert.equal(focused.action, "focus");
  const result = await coord.handle(msg("plain", "修正登入錯誤並跑測試"));
  assert.equal(result.action, "ran");
  assert.equal(store.getJob(result.jobId ?? "")?.projectId, "TeamBot");
  store.close();
});

test("self-chat without focus asks for project choices instead of guessing", async () => {
  const store = new Store();
  const projects = new ProjectRegistry();
  projects.register({ projectId: "TeamBot", cwd: "D:/tb" });
  projects.register({ projectId: "Docs", cwd: "D:/docs" });
  const transport = new Transport();
  const coord = new Coordinator({ store, transport, adapter: {} as CodexAdapter, projects, pairing, now: () => 10 });
  const result = await coord.handle(msg("plain", "跑一下昨天的測試"));
  assert.equal(result.action, "project:clarification-required");
  assert.equal(store.listJobs().length, 0);
  assert.match(transport.sent.join("\n"), /TeamBot/);
  assert.match(transport.sent.join("\n"), /Docs/);
  store.close();
});

