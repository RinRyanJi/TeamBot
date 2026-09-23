import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TEAMBOT_VERSION,
  PINNED_CODEX_CLI_VERSION,
  describeTeamBot,
} from "../src/index.ts";

test("version is defined", () => {
  assert.equal(TEAMBOT_VERSION, "0.0.1");
});

test("pinned codex cli version matches architecture", () => {
  assert.equal(PINNED_CODEX_CLI_VERSION, "0.156.1");
});

test("describeTeamBot mentions Codex and Teams", () => {
  const s = describeTeamBot();
  assert.match(s, /Codex/);
  assert.match(s, /Teams/);
});
