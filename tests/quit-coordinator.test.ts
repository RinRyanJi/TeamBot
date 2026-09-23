import { test } from "node:test";
import assert from "node:assert/strict";
import { QuitCoordinator } from "../src/app/quit-coordinator.ts";

test("starts accepting; stopAccepting flips it", () => {
  const qc = new QuitCoordinator(() => []);
  assert.equal(qc.isAccepting(), true);
  qc.stopAccepting();
  assert.equal(qc.isAccepting(), false);
});

test("drain waits for running jobs to finish, then reports drained", async () => {
  let clock = 0;
  let running = ["T1", "T2"];
  const sleep = async (ms: number) => {
    clock += ms;
    if (clock >= 200) running = []; // jobs finish at t=200ms
  };
  const qc = new QuitCoordinator(() => running, { pollMs: 50, sleep, now: () => clock });
  const r = await qc.drain(1000);
  assert.equal(r.drained, true);
  assert.deepEqual(r.remaining, []);
  assert.equal(qc.isAccepting(), false, "draining stops accepting new work");
  assert.ok(clock >= 200, "must have waited until jobs finished");
});

test("drain times out and reports jobs still running", async () => {
  let clock = 0;
  const running = ["Tstuck"]; // never finishes
  const sleep = async (ms: number) => {
    clock += ms;
  };
  const qc = new QuitCoordinator(() => running, { pollMs: 50, sleep, now: () => clock });
  const r = await qc.drain(200);
  assert.equal(r.drained, false);
  assert.deepEqual(r.remaining, ["Tstuck"]);
});
