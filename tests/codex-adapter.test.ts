import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { CodexAdapter } from "../src/codex/adapter.ts";
import type { SpawnFn, SpawnLike } from "../src/codex/adapter.ts";

// A fake `codex app-server` that speaks the same newline-delimited protocol,
// so the adapter's request/response + notification plumbing is verified
// deterministically without the real binary or auth.
function makeFakeCodex(): { spawn: SpawnFn } {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const lifecycle = new EventEmitter();
  const sendLine = (obj: unknown) =>
    stdout.emit("data", JSON.stringify(obj) + "\n");

  function respond(msg: { id: number; method?: string }): void {
    switch (msg.method) {
      case "initialize":
        sendLine({ id: msg.id, result: { userAgent: "fake/0.156.1", codexHome: "/tmp/.codex" } });
        break;
      case "thread/start":
        sendLine({ id: msg.id, result: { threadId: "th-1" } });
        setImmediate(() => sendLine({ method: "thread/started", params: { threadId: "th-1" } }));
        break;
      case "turn/start":
        sendLine({ id: msg.id, result: { turnId: "tu-1" } });
        setImmediate(() => {
          sendLine({ method: "turn/started", params: { turnId: "tu-1" } });
          sendLine({ method: "item/started", params: { itemId: "i1" } });
          sendLine({ method: "item/completed", params: { itemId: "i1", text: "hello" } });
          sendLine({ method: "turn/completed", params: { turnId: "tu-1" } });
        });
        break;
      case "turn/interrupt":
        sendLine({ id: msg.id, result: {} });
        setImmediate(() =>
          sendLine({ method: "turn/completed", params: { turnId: "tu-1", interrupted: true } }),
        );
        break;
      case "boom":
        sendLine({ id: msg.id, error: { code: -1, message: "boom failed" } });
        break;
      default:
        sendLine({ id: msg.id, result: {} });
    }
  }

  const child: SpawnLike = {
    stdin: {
      write(chunk: string) {
        for (const line of chunk.split("\n").filter(Boolean)) {
          const msg = JSON.parse(line) as { id?: number; method?: string };
          if (typeof msg.id !== "number") continue; // client notification (initialized)
          setImmediate(() => respond(msg as { id: number; method?: string }));
        }
      },
    },
    stdout,
    stderr,
    on(event: string, cb: (arg: never) => void) {
      lifecycle.on(event, cb as (arg: unknown) => void);
    },
    kill() {
      lifecycle.emit("exit", 0);
      return true;
    },
    pid: 4242,
  };

  const spawn: SpawnFn = () => child;
  return { spawn };
}

const once = (em: EventEmitter, ev: string): Promise<unknown> =>
  new Promise((res) => em.once(ev, res));

test("initialize handshake resolves with server info", async () => {
  const { spawn } = makeFakeCodex();
  const adapter = new CodexAdapter({ spawn });
  const result = await adapter.start();
  assert.equal(result.userAgent, "fake/0.156.1");
  assert.equal(result.codexHome, "/tmp/.codex");
  adapter.stop();
});

test("thread + turn lifecycle emits ordered events", async () => {
  const { spawn } = makeFakeCodex();
  const adapter = new CodexAdapter({ spawn });
  const seen: string[] = [];
  for (const ev of ["thread/started", "turn/started", "item/started", "item/completed", "turn/completed"]) {
    adapter.on(ev, () => seen.push(ev));
  }
  await adapter.start();
  const thread = (await adapter.startThread({ cwd: "/p" })) as { threadId: string };
  assert.equal(thread.threadId, "th-1");
  const completed = once(adapter, "turn/completed");
  const turn = (await adapter.startTurn({ threadId: "th-1", input: "hi" })) as { turnId: string };
  assert.equal(turn.turnId, "tu-1");
  await completed;
  assert.deepEqual(seen, [
    "thread/started",
    "turn/started",
    "item/started",
    "item/completed",
    "turn/completed",
  ]);
  adapter.stop();
});

test("interrupt is honored and produces a terminal event", async () => {
  const { spawn } = makeFakeCodex();
  const adapter = new CodexAdapter({ spawn });
  await adapter.start();
  await adapter.startThread({ cwd: "/p" });
  const completed = once(adapter, "turn/completed") as Promise<{ interrupted?: boolean }>;
  await adapter.interrupt({ turnId: "tu-1" });
  const params = await completed;
  assert.equal(params.interrupted, true);
  adapter.stop();
});

test("server error response rejects the request", async () => {
  const { spawn } = makeFakeCodex();
  const adapter = new CodexAdapter({ spawn });
  await adapter.start();
  await assert.rejects(() => adapter.request("boom"), /boom failed/);
  adapter.stop();
});

test("process exit rejects in-flight requests", async () => {
  const { spawn } = makeFakeCodex();
  const adapter = new CodexAdapter({ spawn });
  await adapter.start();
  // never-answered request; then kill -> should reject
  const p = adapter.request("thread/list", {});
  adapter.stop();
  await assert.rejects(() => p, /exited/);
});
