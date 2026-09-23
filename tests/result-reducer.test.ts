import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceTurn, formatResult, type TurnEvent } from "../src/progress/result-reducer.ts";
import { Store } from "../src/storage/store.ts";

test("reducer picks final_answer over commentary and deltas", () => {
  const events: TurnEvent[] = [
    { kind: "agentMessage", phase: "commentary", text: "working on it..." },
    { kind: "command", command: "ls", exitCode: 0 },
    { kind: "agentMessage", phase: "commentary", text: "still going" },
    { kind: "agentMessage", phase: "final_answer", text: "Done: created doc/." },
  ];
  const r = reduceTurn("tu-1", events);
  assert.equal(r.finalText, "Done: created doc/.");
  assert.equal(r.commands.length, 1);
});

test("reducer falls back to last message when no final_answer", () => {
  const r = reduceTurn("tu-2", [
    { kind: "agentMessage", phase: "commentary", text: "first" },
    { kind: "agentMessage", phase: "commentary", text: "last" },
  ]);
  assert.equal(r.finalText, "last");
});

test("reducer aggregates file changes; diff snapshot overrides fileChange counts", () => {
  const r = reduceTurn("tu-3", [
    { kind: "fileChange", path: "a.txt", added: 1, removed: 0 },
    { kind: "fileChange", path: "b.txt", added: 2, removed: 1 },
    { kind: "diff", files: [{ path: "a.txt", added: 10, removed: 3 }] },
  ]);
  const a = r.files.find((f) => f.path === "a.txt");
  assert.deepEqual(a, { path: "a.txt", added: 10, removed: 3 });
  assert.equal(r.files.length, 2);
});

test("formatResult is a two-tier summary and flags failed commands", () => {
  const s = formatResult(
    reduceTurn("tu-4", [
      { kind: "agentMessage", phase: "final_answer", text: "ok" },
      { kind: "fileChange", path: "x.ts", added: 5, removed: 2 },
      { kind: "command", command: "npm test", exitCode: 1 },
    ]),
  );
  assert.match(s, /已完成 · 1 檔變更 · 1 指令/);
  assert.match(s, /x\.ts \(\+5 −2\)/);
  assert.match(s, /失敗指令:npm test \(exit 1\)/);
});

test("outbox result idempotency: one authoritative result per turn", () => {
  const s = new Store();
  assert.equal(s.markResultSent("tu-9", "c1", 1000), true, "first is new");
  assert.equal(s.markResultSent("tu-9", "c1", 1001), false, "duplicate ignored");
  assert.equal(s.resultAlreadySent("tu-9"), true);
  assert.equal(s.resultAlreadySent("tu-x"), false);
  s.close();
});
