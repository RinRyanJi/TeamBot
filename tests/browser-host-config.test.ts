import { test } from "node:test";
import assert from "node:assert/strict";
import {
  remoteWebPreferences,
  assertRemoteIsIsolated,
  isLoopbackHost,
  partitionForChat,
  TEAMS_PARTITION,
} from "../src/browser/browser-host-config.ts";

test("remote web preferences are locked down (no node, no preload, sandboxed)", () => {
  const p = remoteWebPreferences();
  assert.equal(p.nodeIntegration, false);
  assert.equal(p.contextIsolation, true);
  assert.equal(p.sandbox, true);
  assert.equal(p.webSecurity, true);
  assert.equal(p.preload, undefined);
  assert.equal(p.partition, TEAMS_PARTITION);
  assertRemoteIsIsolated(p); // must not throw
});

test("assertRemoteIsIsolated rejects unsafe configs", () => {
  assert.throws(() => assertRemoteIsIsolated({ nodeIntegration: true }), /nodeIntegration/);
  assert.throws(() => assertRemoteIsIsolated({ contextIsolation: false }), /contextIsolation/);
  assert.throws(() => assertRemoteIsIsolated({ sandbox: false }), /sandbox/);
  assert.throws(() => assertRemoteIsIsolated({ preload: "/x/preload.js" }), /preload/);
});

test("partitions are persistent and share the login partition across chats", () => {
  assert.ok(TEAMS_PARTITION.startsWith("persist:"), "must be a persistent partition");
  assert.ok(partitionForChat("c1").startsWith(TEAMS_PARTITION));
  assert.ok(partitionForChat("c2").startsWith(TEAMS_PARTITION));
});

test("control endpoint host must be loopback only", () => {
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("::1"), true);
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("0.0.0.0"), false);
  assert.equal(isLoopbackHost("192.168.1.5"), false);
  assert.equal(isLoopbackHost("example.com"), false);
});
