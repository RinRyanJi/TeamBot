import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Store } from "../src/storage/store.ts";
import { CodexAdapter } from "../src/codex/adapter.ts";
import type { SpawnFn, SpawnLike } from "../src/codex/adapter.ts";
import { TurnControl } from "../src/supervisor/turn-control.ts";

// Fake codex whose turn stays OPEN after turn/start, so we can act mid-run.
// `onTurn` lets each test decide what steer/interrupt/answer produce.
function fakeSpawn(onTurn: {
  steer?: (send: (o: unknown) => void) => void;
  interrupt?: (send: (o: unknown) => void) => void;
  afterStart?: (send: (o: unknown) => void) => void;
  onClientResponse?: (send: (o: unknown) => void) => void;
}): SpawnFn {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const life = new EventEmitter();
  const send = (o: unknown) => stdout.emit("data", JSON.stringify(o) + "\n");
  const child: SpawnLike = {
    stdin: {
      write(chunk: string) {
        for (const line of chunk.split("\n").filter(Boolean)) {
          const m = JSON.parse(line) as { id?: number; method?: string };
          setImmediate(() => {
            if (typeof m.id === "number" && !m.method) {
              onTurn.onClientResponse?.(send); // response to a serverRequest
              return;
            }
            if (typeof m.id !== "number") return; // client notification
            switch (m.method) {
              case "initialize":
                send({ id: m.id, result: { userAgent: "fake", codexHome: "/tmp" } });
                break;
              case "thread/start":
                send({ id: m.id, result: { threadId: "th-1" } });
                break;
              case "turn/start":
                send({ id: m.id, result: { turnId: "tu-1" } });
                setImmediate(() => {
                  send({ method: "turn/started", params: { turnId: "tu-1" } });
                  onTurn.afterStart?.(send);
                }); // NOTE: no turn/completed -> turn stays open
                break;
              case "turn/steer":
                send({ id: m.id, result: {} });
                setImmediate(() => onTurn.steer?.(send));
                break;
              case "turn/interrupt":
                send({ id: m.id, result: {} });
                setImmediate(() => onTurn.interrupt?.(send));
                break;
              default:
                send({ id: m.id, result: {} });
            }
          });
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

function runningJob(store: Store): void {
  store.createJob({
    jobId: "T1",
    chatId: "c1",
    senderId: "u1",
    projectId: "P",
    cwd: "/p",
    status: "starting",
    createdAt: 0,
  });
}

test("stop: request marks 'stopping'; 'cancelled' only after the turn actually ends", async () => {
  const store = new Store();
  runningJob(store);
  const adapter = new CodexAdapter({
    spawn: fakeSpawn({
      interrupt: (send) => send({ method: "turn/completed", params: { interrupted: true } }),
    }),
  });
  await adapter.start();
  const tc = new TurnControl(store, adapter, () => 0);
  await tc.begin("T1", "th-1", "do it");
  assert.equal(store.getJob("T1")?.status, "running");

  const settled = tc.stop();
  // Immediately after requesting stop, the job is 'stopping', NOT yet 'cancelled'.
  assert.equal(store.getJob("T1")?.status, "stopping");
  const outcome = await settled;
  assert.equal(outcome, "cancelled");
  assert.equal(store.getJob("T1")?.status, "cancelled");
  adapter.stop();
});

test("mid-run steer is delivered and shapes the completion", async () => {
  const store = new Store();
  runningJob(store);
  const adapter = new CodexAdapter({
    spawn: fakeSpawn({
      steer: (send) => {
        send({ method: "item/completed", params: { text: "steered: prioritized windows" } });
        send({ method: "turn/completed", params: {} });
      },
    }),
  });
  await adapter.start();
  const tc = new TurnControl(store, adapter, () => 0);
  await tc.begin("T1", "th-1", "start work");
  assert.equal(store.getJob("T1")?.status, "running");
  await tc.steer("prioritize windows");
  const outcome = await tc.settled;
  assert.equal(outcome, "completed");
  assert.equal(store.getJob("T1")?.lastResult, "steered: prioritized windows");
  adapter.stop();
});

test("answer resolves a mid-run input request and lets the turn complete", async () => {
  const store = new Store();
  runningJob(store);
  const adapter = new CodexAdapter({
    spawn: fakeSpawn({
      afterStart: (send) =>
        send({ method: "item/tool/requestUserInput", id: 99, params: { question: "which plan?" } }),
      onClientResponse: (send) => {
        send({ method: "item/completed", params: { text: "used plan B" } });
        send({ method: "turn/completed", params: {} });
      },
    }),
  });
  await adapter.start();
  const tc = new TurnControl(store, adapter, () => 0);
  adapter.on("serverRequest", (m: unknown) => {
    const id = (m as { id: number }).id;
    tc.answer(id, "plan B");
  });
  await tc.begin("T1", "th-1", "start");
  const outcome = await tc.settled;
  assert.equal(outcome, "completed");
  assert.equal(store.getJob("T1")?.lastResult, "used plan B");
  adapter.stop();
});
