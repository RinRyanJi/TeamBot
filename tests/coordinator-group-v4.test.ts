import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, type Pairing, type InboxMessage } from "../src/storage/store.ts";
import { EventEmitter } from "node:events";
import { Coordinator } from "../src/app/coordinator.ts";
import { ProjectRegistry } from "../src/app/projects.ts";
import { RoutedTeamsTransport, type TeamsTransport, type TeamsMessage } from "../src/transports/teams/transport.ts";
import type { CodexAdapter } from "../src/codex/adapter.ts";

class Transport implements TeamsTransport {
  sent: string[] = [];
  private readonly id: string;
  constructor(id = "group") { this.id = id; }
  chatId(): string { return this.id; }
  async readMessages(): Promise<TeamsMessage[]> { return []; }
  async sendMessage(text: string): Promise<string> { this.sent.push(text); return "sent"; }
  async close(): Promise<void> {}
}

class ApprovalAdapter extends EventEmitter {
  responses: Array<{ id: number; result: unknown }> = [];
  respond(id: number, result: unknown): void { this.responses.push({ id, result }); }
}

const msg = (id: string, senderId: string, text: string, chatId = "group"): InboxMessage => ({ tenant: "t", chatId, messageId: id, senderId, text, receivedAt: 10 });

test("group overview is summary-only and viewer cannot dispatch work", async () => {
  const store = new Store();
  store.createJob({ jobId: "T-G", chatId: "group", senderId: "operator", projectId: "TeamBot", cwd: "D:/tb", status: "running", createdAt: 1 });
  store.createJob({ jobId: "T-P", chatId: "self", senderId: "owner", projectId: "TeamBot", cwd: "D:/tb", status: "running", createdAt: 2 });
  const projects = new ProjectRegistry();
  projects.register({ projectId: "TeamBot", name: "TeamBot", cwd: "D:/tb" });
  projects.register({ projectId: "Private", name: "Private", cwd: "D:/private" });
  const pairing: Pairing = {
    id: "g", tenant: "t", account: "owner", chatId: "group", kind: "group",
    allowlist: ["operator", "viewer"], roles: { operator: "operator", viewer: "viewer" }, projects: ["TeamBot"], createdAt: 1,
  };
  const transport = new Transport("group");
  const coord = new Coordinator({ store, transport, adapter: {} as CodexAdapter, projects, pairing, now: () => 10 });
  const overview = await coord.handle(msg("m1", "viewer", "!tb overview"));
  assert.equal(overview.action, "overview");
  assert.ok(transport.sent.some((text) => text.includes("T-G")));
  assert.ok(!transport.sent.some((text) => text.includes("T-P")));
  const cards = await coord.handle(msg("m-projects", "viewer", "!tb projects"));
  assert.equal(cards.action, "projects");
  assert.ok(!transport.sent.some((text) => text.includes("Private")));
  const denied = await coord.handle(msg("m2", "viewer", "!tb run TeamBot inspect"));
  assert.equal(denied.action, "denied:group-role");
  assert.equal(store.getJob("T002"), undefined);
  store.close();
});

test("approval server request is persisted, surfaced, and resolved once", async () => {
  const store = new Store();
  store.createJob({ jobId: "T-A", chatId: "self", senderId: "me", projectId: "TeamBot", cwd: "D:/tb", threadId: "th", activeTurnId: "tu", status: "running", createdAt: 1 });
  const projects = new ProjectRegistry();
  projects.register({ projectId: "TeamBot", cwd: "D:/tb" });
  const pairing: Pairing = { id: "p", tenant: "t", account: "me", chatId: "self", kind: "self", allowlist: ["me"], projects: ["TeamBot"], createdAt: 1 };
  const transport = new Transport("self");
  const adapter = new ApprovalAdapter();
  const coord = new Coordinator({ store, transport, adapter: adapter as unknown as CodexAdapter, projects, pairing, now: () => 10 });
  adapter.emit("serverRequest", { id: 7, method: "item/commandExecution/requestApproval", params: { threadId: "th", command: "delete build" } });
  await new Promise((resolve) => setImmediate(resolve));
  const approval = store.listPendingApprovals()[0];
  assert.ok(approval);
  assert.match(transport.sent.join("\n"), new RegExp(approval.code));
  assert.match(transport.sent.join("\n"), /Project：TeamBot/);
  assert.match(transport.sent.join("\n"), /Task：T-A/);
  assert.match(transport.sent.join("\n"), /Turn：tu/);
  assert.match(transport.sent.join("\n"), /cwd：D:\/tb/);
  assert.match(transport.sent.join("\n"), /失效時間：/);
  const result = await coord.handle(msg("approval", "me", `!tb approve ${approval.code}`, "self"));
  assert.equal(result.action, "approve");
  assert.deepEqual(adapter.responses[0], { id: 7, result: { accept: true } });
  assert.equal(store.getApproval(approval.code)?.status, "approved");
  store.close();
});

test("unknown Codex thread is rejected instead of guessed across projects", async () => {
  const store = new Store();
  store.createJob({ jobId: "T-KNOWN", chatId: "self", senderId: "me", projectId: "TeamBot", cwd: "D:/tb", threadId: "known", status: "running", createdAt: 1 });
  const projects = new ProjectRegistry();
  projects.register({ projectId: "TeamBot", cwd: "D:/tb" });
  const pairing: Pairing = { id: "p", tenant: "t", account: "me", chatId: "self", kind: "self", allowlist: ["me"], projects: ["TeamBot"], createdAt: 1 };
  const transport = new Transport("self");
  const adapter = new ApprovalAdapter();
  new Coordinator({ store, transport, adapter: adapter as unknown as CodexAdapter, projects, pairing, now: () => 10 });
  adapter.emit("serverRequest", { id: 77, method: "item/commandExecution/requestApproval", params: { threadId: "unknown", command: "rm -rf build" } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.listPendingApprovals().length, 0);
  assert.deepEqual(adapter.responses, [{ id: 77, result: { accept: false } }]);
  store.close();
});

test("dangerous group approval is bound to the configured private chat", async () => {
  const store = new Store();
  store.createJob({ jobId: "T-AG", chatId: "group", senderId: "operator", projectId: "TeamBot", cwd: "D:/tb", threadId: "thg", activeTurnId: "tug", status: "running", createdAt: 1 });
  const projects = new ProjectRegistry();
  projects.register({ projectId: "TeamBot", cwd: "D:/tb" });
  const pairing: Pairing = { id: "g", tenant: "t", account: "operator", chatId: "group", kind: "group", allowlist: ["operator"], roles: { operator: "operator" }, projects: ["TeamBot"], createdAt: 1 };
  const transport = new Transport();
  const adapter = new ApprovalAdapter();
  new Coordinator({ store, transport, adapter: adapter as unknown as CodexAdapter, projects, pairing, privateApprovalChatId: "self-operator", now: () => 10 });
  adapter.emit("serverRequest", { id: 8, method: "item/commandExecution/requestApproval", params: { threadId: "thg", command: "delete build" } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.listPendingApprovals()[0]?.chatId, "self-operator");
  store.close();
});

test("dangerous group approval is delivered to self chat and can be resolved there", async () => {
  const store = new Store();
  store.createJob({ jobId: "T-ROUTE", chatId: "group", senderId: "operator", projectId: "TeamBot", cwd: "D:/tb", threadId: "th-route", activeTurnId: "tu-route", status: "running", createdAt: 1 });
  const projects = new ProjectRegistry();
  projects.register({ projectId: "TeamBot", cwd: "D:/tb" });
  const group: Pairing = { id: "g", tenant: "t", account: "operator", chatId: "group", kind: "group", allowlist: ["operator"], roles: { operator: "operator" }, projects: ["TeamBot"], createdAt: 1 };
  const self: Pairing = { id: "s", tenant: "t", account: "operator", chatId: "self", kind: "self", allowlist: ["operator"], projects: ["TeamBot"], createdAt: 1 };
  const groupTransport = new Transport();
  const selfTransport = new Transport();
  const routes = new RoutedTeamsTransport(new Map([["group", groupTransport], ["self", selfTransport]]), "group");
  const adapter = new ApprovalAdapter();
  const groupCoord = new Coordinator({ store, transport: routes, adapter: adapter as unknown as CodexAdapter, projects, pairing: group, privateApprovalChatId: "self", now: () => 10 });
  adapter.emit("serverRequest", { id: 21, method: "item/commandExecution/requestApproval", params: { threadId: "th-route", command: "git push --force" } });
  await new Promise((resolve) => setImmediate(resolve));
  const approval = store.listPendingApprovals()[0];
  assert.ok(approval);
  assert.equal(approval.chatId, "self");
  assert.ok(selfTransport.sent.some((text) => text.includes(approval.code)));
  assert.equal(groupTransport.sent.some((text) => text.includes(approval.code)), false);

  // A separate self-chat coordinator shares the Store and Codex adapter, as the
  // desktop router does for distinct conversation pairings.
  const selfCoord = new Coordinator({ store, transport: routes, adapter: adapter as unknown as CodexAdapter, projects, pairing: self, now: () => 10 });
  const result = await selfCoord.handle(msg("approval-self", "operator", `ok ${approval.code}`, "self"));
  assert.equal(result.action, "approve");
  assert.deepEqual(adapter.responses.find((r) => r.id === 21), { id: 21, result: { accept: true } });
  groupCoord;
  store.close();
});

