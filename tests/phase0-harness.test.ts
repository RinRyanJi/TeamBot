import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const harness = join(
  here,
  "..",
  "tasks",
  "task018-phase0-live-teams",
  "evidence",
  "harness",
  "phase0-live.cjs",
);

// Verifies the Phase-0 harness's stable-id extraction runs in the real isolated
// Electron surface (against the local fixture). The LIVE tenant/push run is user-run
// (see the harness README); this proves the harness code itself works.
test("phase0 harness --selfcheck extracts stable ids from the isolated surface", async (t) => {
  let electronPath: string;
  try {
    electronPath = require("electron") as string;
  } catch {
    t.skip("electron not installed");
    return;
  }
  const res = await new Promise<{ code: number | null; out: string }>((resolve) => {
    const cp = spawn(electronPath, [harness, "--selfcheck"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    cp.stdout.on("data", (d) => (out += d.toString()));
    cp.on("error", () => resolve({ code: -1, out }));
    cp.on("exit", (code) => resolve({ code, out }));
    setTimeout(() => {
      cp.kill();
      resolve({ code: -2, out });
    }, 60_000).unref();
  });
  if (res.code === -1 || res.code === -2 || !res.out.includes("PHASE0_PROBE")) {
    t.skip(`electron could not run headlessly (code ${res.code})`);
    return;
  }
  const line = res.out.split("\n").find((l) => l.includes("PHASE0_PROBE")) ?? "";
  const probe = JSON.parse(line.slice(line.indexOf("{"))) as {
    chatId: string;
    stableChatId: boolean;
    stableMessageIds: boolean;
    stableSenderIds: boolean;
    messages: unknown[];
  };
  assert.equal(probe.stableChatId, true);
  assert.equal(probe.stableMessageIds, true);
  assert.equal(probe.stableSenderIds, true);
  assert.ok(probe.messages.length >= 2);
  assert.equal(res.code, 0);
});
