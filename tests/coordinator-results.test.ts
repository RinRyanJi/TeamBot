import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Store, type InboxMessage, type Pairing } from "../src/storage/store.ts";
import { Coordinator } from "../src/app/coordinator.ts";
import { ProjectRegistry } from "../src/app/projects.ts";
import type { CodexAdapter } from "../src/codex/adapter.ts";
import type { TeamsMessage, TeamsTransport } from "../src/transports/teams/transport.ts";

class StructuredAdapter extends EventEmitter {
  private readonly failed: boolean;
  constructor(failed = false) { super(); this.failed = failed; }
  async startThread(): Promise<{ threadId: string }> { return { threadId: "thread-results" }; }
  async startTurn(): Promise<{ turnId: string }> {
    setImmediate(() => {
      this.emit("turn/started", { threadId: "thread-results", turnId: "turn-results" });
      this.emit("item/started", { threadId: "thread-results", turnId: "turn-results", item: { type: "commandExecution", command: "npm test" } });
      this.emit("item/completed", {
        threadId: "thread-results", turnId: "turn-results",
        item: { type: "commandExecution", command: "npm test", exitCode: this.failed ? 1 : 0 },
      });
      this.emit("item/completed", {
        threadId: "thread-results", turnId: "turn-results",
        item: { type: "fileChange", changes: [{ path: "src/login.ts", added: 4, removed: 1 }] },
      });
      this.emit("item/completed", {
        threadId: "thread-results", turnId: "turn-results",
        item: { type: "artifact", artifact: { path: "reports/login.md", kind: "report", sha256: "abc123" } },
      });
      this.emit("thread/attachment/updated", {
        threadId: "thread-results", turnId: "turn-results",
        attachment: { path: "logs/test-output.txt", kind: "log", hash: "def456" },
      });
      this.emit("item/completed", {
        threadId: "thread-results", turnId: "turn-results",
        item: { type: "agentMessage", phase: "final_answer", text: "login fixed; tests pass" },
      });
      this.emit("turn/completed", { threadId: "thread-results", turnId: "turn-results" });
    });
    return { turnId: "turn-results" };
  }
  async steer(): Promise<void> {}
  async interrupt(): Promise<void> {}
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
  allowlist: ["me"], projects: ["TeamBot"], createdAt: 1,
};
const message = (id: string): InboxMessage => ({
  tenant: "t", chatId: "self", messageId: id, senderId: "me", text: "!tb run TeamBot fix login", receivedAt: 10,
});

test("coordinator folds Codex items into the task result and changed-file card", async () => {
  const store = new Store();
  const projects = new ProjectRegistry();
  projects.register({ projectId: "TeamBot", name: "TeamBot", cwd: "D:/tb" });
  const transport = new Transport();
  const coord = new Coordinator({
    store,
    transport,
    adapter: new StructuredAdapter() as unknown as CodexAdapter,
    projects,
    pairing,
    now: () => 10,
  });

  const result = await coord.handle(message("m-results"));
  assert.equal(result.action, "ran");
  const job = store.getJob(result.jobId ?? "");
  assert.ok(job);
  assert.equal(job.status, "completed");
  assert.deepEqual(job.changedFiles, ["src/login.ts"]);
  assert.equal(job.artifactCount, 2);
  assert.deepEqual(store.listArtifacts(job.jobId).map((artifact) => [artifact.path, artifact.kind, artifact.hash]), [
    ["reports/login.md", "report", "abc123"],
    ["logs/test-output.txt", "log", "def456"],
  ]);
  assert.match(job.lastResult ?? "", /login fixed/);
  assert.match(job.resultSummary ?? "", /1 檔變更/);
  assert.deepEqual(store.listEvents(job.jobId).map((event) => event.kind), [
    "turn/started", "item/started", "item/completed", "item/completed", "item/completed", "thread/attachment/updated", "item/completed", "turn/completed",
  ]);
  assert.match(transport.sent.join("\n"), /login fixed/);
  assert.match(transport.sent.join("\n"), /Project：TeamBot · Task：T001 · 已完成/);
  await coord.handle({ ...message("m-artifact"), text: "!tb artifact T001" });
  assert.match(transport.sent.at(-1) ?? "", /reports\/login\.md · report/);
  store.close();
});

test("failed command is surfaced as completed_with_followup", async () => {
  const store = new Store();
  const projects = new ProjectRegistry();
  projects.register({ projectId: "TeamBot", name: "TeamBot", cwd: "D:/tb" });
  const transport = new Transport();
  const coord = new Coordinator({
    store,
    transport,
    adapter: new StructuredAdapter(true) as unknown as CodexAdapter,
    projects,
    pairing,
    now: () => 10,
  });

  const result = await coord.handle(message("m-results-failed"));
  const job = store.getJob(result.jobId ?? "");
  assert.ok(job);
  assert.equal(job.status, "completed_with_followup");
  assert.match(job.resultSummary ?? "", /完成但需後續/);
  assert.match(transport.sent.join("\n"), /已完成但需後續/);
  store.close();
});
