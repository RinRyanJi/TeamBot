import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "../src/router/parser.ts";

test("help and projects", () => {
  assert.deepEqual(parseCommand("!tb help"), { ok: true, command: { kind: "help" } });
  assert.deepEqual(parseCommand("!tb projects"), {
    ok: true,
    command: { kind: "projects" },
  });
});

test("run captures project alias and free-text request", () => {
  const r = parseCommand("!tb run TeamBot 請檢查登入失敗原因 並跑測試");
  assert.deepEqual(r, {
    ok: true,
    command: { kind: "run", projectId: "TeamBot", request: "請檢查登入失敗原因 並跑測試" },
  });
});

test("status/stop/result take a job id", () => {
  assert.deepEqual(parseCommand("!tb status T001"), {
    ok: true,
    command: { kind: "status", jobId: "T001" },
  });
  assert.deepEqual(parseCommand("!tb stop T12"), {
    ok: true,
    command: { kind: "stop", jobId: "T12" },
  });
  assert.deepEqual(parseCommand("!tb result T7"), {
    ok: true,
    command: { kind: "result", jobId: "T7" },
  });
});

test("continue/steer take job id + request", () => {
  assert.deepEqual(parseCommand("!tb continue T001 再補上測試"), {
    ok: true,
    command: { kind: "continue", jobId: "T001", request: "再補上測試" },
  });
  assert.deepEqual(parseCommand("!tb steer T001 優先處理 Windows 問題"), {
    ok: true,
    command: { kind: "steer", jobId: "T001", request: "優先處理 Windows 問題" },
  });
});

test("approve/deny take approval code; answer takes question id + text", () => {
  assert.deepEqual(parseCommand("!tb approve A7K2"), {
    ok: true,
    command: { kind: "approve", code: "A7K2" },
  });
  assert.deepEqual(parseCommand("!tb deny A7K2"), {
    ok: true,
    command: { kind: "deny", code: "A7K2" },
  });
  assert.deepEqual(parseCommand("!tb answer Q8F3 使用第二種方案"), {
    ok: true,
    command: { kind: "answer", questionId: "Q8F3", text: "使用第二種方案" },
  });
});

test("prefix and subcommand are case-insensitive", () => {
  assert.deepEqual(parseCommand("!TB HELP"), { ok: true, command: { kind: "help" } });
  assert.deepEqual(parseCommand("  !Tb Status t9  "), {
    ok: true,
    command: { kind: "status", jobId: "t9" },
  });
});

test("a [TB ...] report line is NOT parsed as a command", () => {
  assert.deepEqual(parseCommand("[TB T001] 已完成；修改摘要：…"), {
    ok: false,
    reason: "not-a-command",
  });
});

test("ordinary chat without prefix is not a command", () => {
  assert.deepEqual(parseCommand("繼續 T001 吧"), { ok: false, reason: "not-a-command" });
  assert.deepEqual(parseCommand("hello world"), { ok: false, reason: "not-a-command" });
});

test("malformed commands are rejected with reasons", () => {
  assert.deepEqual(parseCommand("!tb"), { ok: false, reason: "unknown-command" });
  assert.deepEqual(parseCommand("!tb frobnicate T1"), {
    ok: false,
    reason: "unknown-command",
  });
  assert.deepEqual(parseCommand("!tb run TeamBot"), {
    ok: false,
    reason: "missing-args",
  });
  assert.deepEqual(parseCommand("!tb status"), { ok: false, reason: "missing-args" });
  assert.deepEqual(parseCommand("!tb status X1"), { ok: false, reason: "bad-id" });
  assert.deepEqual(parseCommand("!tb approve T1"), { ok: false, reason: "bad-id" });
  assert.deepEqual(parseCommand("!tb answer Q1"), { ok: false, reason: "missing-args" });
});
