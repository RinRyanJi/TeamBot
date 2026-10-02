import { test } from "node:test";
import assert from "node:assert/strict";
import { RoutedTeamsTransport, ScopedTeamsTransport, type TeamsMessage, type TeamsTransport } from "../src/transports/teams/transport.ts";

class FakeTransport implements TeamsTransport {
  sent: string[] = [];
  private readonly id: string;
  constructor(id: string) { this.id = id; }
  chatId(): string { return this.id; }
  async readMessages(): Promise<TeamsMessage[]> { return []; }
  async sendMessage(text: string): Promise<string> { this.sent.push(text); return `${this.id}-${this.sent.length}`; }
  async close(): Promise<void> {}
}

test("RoutedTeamsTransport sends approvals to the requested conversation", async () => {
  const group = new FakeTransport("group");
  const self = new FakeTransport("self");
  const routed = new RoutedTeamsTransport(new Map([["group", group], ["self", self]]), "group");
  await routed.sendMessageTo("self", "approval A1");
  await routed.sendMessage("summary");
  assert.deepEqual(self.sent, ["approval A1"]);
  assert.deepEqual(group.sent, ["summary"]);
});

test("ScopedTeamsTransport binds reads and writes to one conversation", async () => {
  const calls: string[] = [];
  const adapter = {
    chatId: () => "self",
    async readMessages(): Promise<TeamsMessage[]> { return []; },
    async readMessagesFrom(chatId: string): Promise<TeamsMessage[]> { calls.push(`read:${chatId}`); return [{ chatId, messageId: "m", senderId: "u", text: "hello" }]; },
    async sendMessage(text: string): Promise<string> { calls.push(`send:self:${text}`); return "s"; },
    async sendMessageTo(chatId: string, text: string): Promise<string> { calls.push(`send:${chatId}:${text}`); return "s"; },
    async close(): Promise<void> {},
  } satisfies TeamsTransport & { readMessagesFrom(chatId: string): Promise<TeamsMessage[]> };
  const scoped = new ScopedTeamsTransport(adapter, "group");
  assert.equal(scoped.chatId(), "group");
  assert.equal((await scoped.readMessages())[0]?.chatId, "group");
  await scoped.sendMessage("summary");
  assert.deepEqual(calls, ["read:group", "send:group:summary"]);
});

