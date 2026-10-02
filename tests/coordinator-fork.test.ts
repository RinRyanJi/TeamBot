import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Store, type InboxMessage, type Pairing } from "../src/storage/store.ts";
import { Coordinator } from "../src/app/coordinator.ts";
import { ProjectRegistry } from "../src/app/projects.ts";
import type { TeamsMessage, TeamsTransport } from "../src/transports/teams/transport.ts";
import type { CodexAdapter } from "../src/codex/adapter.ts";
import type { WorktreeRuntime } from "../src/supervisor/worktree-runtime.ts";

class Adapter extends EventEmitter {
  async startThread(): Promise<{ threadId: string }> { return { threadId: "fork-thread" }; }
  async startTurn(): Promise<{ turnId: string }> {
    setImmediate(() => {
      this.emit("item/completed", { text: "fork result" });
      this.emit("turn/completed", { turnId: "fork-turn" });
    });
    return { turnId: "fork-turn" };
  }
  async steer(): Promise<void> {}
  async interrupt(): Promise<void> {}
  stop(): void {}
}

class Transport implements TeamsTransport {
  sent: string[] = [];
  chatId(): string { return "self"; }
  async readMessages(): Promise<TeamsMessage[]> { return []; }
  async sendMessage(text: string): Promise<string> { this.sent.push(text); return "sent"; }
  async close(): Promise<void> {}
}

const input = (id: string, text: string): InboxMessage => ({ tenant: "t", chatId: "self", messageId: id, senderId: "me", text, receivedAt: 10 });

test("fork requires confirmation and runs in a real worktree path supplied by the runtime", async () => {
  const store = new Store();
  store.createJob({ jobId: "T001", chatId: "self", senderId: "me", projectId: "TeamBot", cwd: "D:/tb", status: "completed", createdAt: 1 });
  const projects = new ProjectRegistry();
  projects.register({ projectId: "TeamBot", cwd: "D:/tb", lanePolicy: "worktree-fork" });
  const pairing: Pairing = { id: "p", tenant: "t", account: "me", chatId: "self", kind: "self", allowlist: ["me"], projects: ["TeamBot"], createdAt: 1 };
  const runtime: WorktreeRuntime = { create: async (_cwd, taskId) => `D:/tb/.worktrees/${taskId}`, remove: async () => {} };
  const coord = new Coordinator({ store, transport: new Transport(), adapter: new Adapter() as unknown as CodexAdapter, projects, pairing, worktrees: runtime, now: () => 10 });
  const preview = await coord.handle(input("m1", "!tb fork T001 add compatibility tests"));
  assert.equal(preview.action, "fork:confirmation-required");
  assert.equal(store.getJob("T002"), undefined);
  const result = await coord.handle(input("m2", "!tb fork T001 confirm add compatibility tests"));
  assert.equal(result.action, "ran");
  const fork = store.getJob("T002");
  assert.ok(fork);
  assert.equal(fork.executionMode, "worktree");
  assert.equal(fork.status, "merge-pending");
  assert.match(fork.worktreePath ?? "", /T002/);
  store.close();
});

