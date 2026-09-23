import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Store } from "../src/storage/store.ts";
import type { Pairing, InboxMessage } from "../src/storage/store.ts";
import { CodexAdapter } from "../src/codex/adapter.ts";
import type { SpawnFn, SpawnLike } from "../src/codex/adapter.ts";
import { Coordinator } from "../src/app/coordinator.ts";
import { ProjectRegistry } from "../src/app/projects.ts";
import type { TeamsMessage, TeamsTransport } from "../src/transports/teams/transport.ts";

// Fake codex that completes a turn with a result summary.
function fakeCodexSpawn(resultText: string): SpawnFn {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const life = new EventEmitter();
  const send = (o: unknown) => stdout.emit("data", JSON.stringify(o) + "\n");
  function respond(msg: { id: number; method?: string }): void {
    switch (msg.method) {
      case "initialize":
        send({ id: msg.id, result: { userAgent: "fake", codexHome: "/tmp" } });
        break;
      case "thread/start":
        send({ id: msg.id, result: { threadId: "th-1" } });
        break;
      case "turn/start":
        send({ id: msg.id, result: { turnId: "tu-1" } });
        setImmediate(() => {
          send({ method: "item/completed", params: { text: resultText } });
          send({ method: "turn/completed", params: { turnId: "tu-1" } });
        });
        break;
      default:
        send({ id: msg.id, result: {} });
    }
  }
  const child: SpawnLike = {
    stdin: {
      write(chunk: string) {
        for (const line of chunk.split("\n").filter(Boolean)) {
          const m = JSON.parse(line) as { id?: number; method?: string };
          if (typeof m.id === "number") setImmediate(() => respond(m as { id: number; method?: string }));
        }
      },
    },
    stdout,
    stderr,
    on(event: string, cb: (arg: never) => void) {
      life.on(event, cb as (arg: unknown) => void);
    },
    kill() {
      life.emit("exit", 0);
      return true;
    },
  };
  return () => child;
}

class FakeTransport implements TeamsTransport {
  sent: string[] = [];
  private _chatId: string;
  private incoming: TeamsMessage[];
  constructor(chatId: string, incoming: TeamsMessage[]) {
    this._chatId = chatId;
    this.incoming = incoming;
  }
  chatId(): string {
    return this._chatId;
  }
  async readMessages(): Promise<TeamsMessage[]> {
    return this.incoming;
  }
  async sendMessage(text: string): Promise<string> {
    this.sent.push(text);
    return "sent-" + this.sent.length;
  }
  async close(): Promise<void> {}
}

const baseAt = 1_700_000_000_000;
function selfPairing(): Pairing {
  return {
    id: "p1",
    tenant: "t1",
    account: "me@x",
    chatId: "self1",
    kind: "self",
    allowlist: ["me@x"],
    projects: ["TeamBot"],
    baselineMessageId: "m0",
    baselineAt: baseAt,
    createdAt: baseAt,
  };
}
function msg(id: string, text: string): InboxMessage {
  return { tenant: "t1", chatId: "self1", messageId: id, senderId: "me@x", text, receivedAt: baseAt + 1000 };
}

async function makeCoordinator(resultText: string) {
  const store = new Store();
  const pairing = selfPairing();
  store.upsertPairing(pairing);
  const projects = new ProjectRegistry();
  projects.register({ projectId: "TeamBot", cwd: "D:/proj/TeamBot" });
  const adapter = new CodexAdapter({ spawn: fakeCodexSpawn(resultText) });
  await adapter.start();
  const transport = new FakeTransport("self1", []);
  const coord = new Coordinator({
    store,
    transport,
    adapter,
    projects,
    pairing,
    now: () => baseAt + 2000,
  });
  return { store, coord, transport, adapter };
}

test("one run message creates exactly one job, runs in the project, returns result", async () => {
  const { store, coord, transport, adapter } = await makeCoordinator("fixed login; 3 tests pass");
  const res = await coord.handle(msg("m1", "!tb run TeamBot fix login and run tests"));
  assert.equal(res.action, "ran");
  assert.equal(res.jobId, "T001");

  const job = store.getJob("T001");
  assert.ok(job);
  assert.equal(job.status, "completed");
  assert.equal(job.projectId, "TeamBot");
  assert.equal(job.cwd, "D:/proj/TeamBot");
  assert.equal(job.threadId, "th-1");
  assert.equal(job.lastResult, "fixed login; 3 tests pass");

  // Acknowledged then completed, both routed to the source conversation.
  assert.ok(transport.sent.some((s) => s.includes("[TB T001]") && s.includes("已接收")));
  assert.ok(transport.sent.some((s) => s.includes("[TB T001]") && s.includes("已完成") && s.includes("fixed login")));
  adapter.stop();
});

test("status and result are answered from stored state (no model run)", async () => {
  const { coord, transport, adapter } = await makeCoordinator("done");
  await coord.handle(msg("m1", "!tb run TeamBot go"));
  const before = transport.sent.length;
  const s = await coord.handle(msg("m2", "!tb status T001"));
  assert.equal(s.action, "status");
  assert.ok(transport.sent.slice(before).some((x) => x.includes("狀態：completed")));
  const r = await coord.handle(msg("m3", "!tb result T001"));
  assert.equal(r.action, "result");
  assert.ok(transport.sent.some((x) => x.includes("結果：done")));
  adapter.stop();
});

test("duplicate run message does not create a second job", async () => {
  const { store, coord, adapter } = await makeCoordinator("ok");
  const dup = msg("m1", "!tb run TeamBot go");
  await coord.handle(dup);
  const again = await coord.handle(dup);
  assert.equal(again.action, "ignored:duplicate");
  assert.ok(store.getJob("T001"));
  assert.equal(store.getJob("T002"), undefined, "no second job");
  adapter.stop();
});

test("unregistered project is refused by authorization (no Codex start)", async () => {
  const { coord, adapter } = await makeCoordinator("ok");
  const res = await coord.handle(msg("m1", "!tb run Secret go"));
  assert.equal(res.action, "denied:project-not-authorized");
  adapter.stop();
});
