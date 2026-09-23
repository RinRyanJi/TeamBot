// SQLite schema for TeamBot local state (architecture §6/§7/§8).
// Applied by Store on open; versioned via PRAGMA user_version for future migrations.

export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS pairings (
  id            TEXT PRIMARY KEY,
  tenant        TEXT NOT NULL,
  account       TEXT NOT NULL,
  chatId        TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('self','group')),
  allowlist     TEXT NOT NULL DEFAULT '[]',   -- JSON array of sender ids
  projects      TEXT NOT NULL DEFAULT '[]',   -- JSON array of project ids
  baselineMessageId TEXT,
  baselineAt    INTEGER,                       -- messages at/before this are history, not executed
  createdAt     INTEGER NOT NULL,
  UNIQUE (tenant, chatId)
);

CREATE TABLE IF NOT EXISTS jobs (
  jobId         TEXT PRIMARY KEY,
  chatId        TEXT NOT NULL,
  senderId      TEXT NOT NULL,
  projectId     TEXT NOT NULL,
  cwd           TEXT NOT NULL,
  threadId      TEXT,
  activeTurnId  TEXT,
  status        TEXT NOT NULL,
  createdAt     INTEGER NOT NULL,
  lastEventAt   INTEGER,
  lastResult    TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  jobId         TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  kind          TEXT NOT NULL,
  payload       TEXT,                          -- JSON
  createdAt     INTEGER NOT NULL,
  UNIQUE (jobId, seq)
);

CREATE TABLE IF NOT EXISTS approvals (
  code          TEXT PRIMARY KEY,
  jobId         TEXT NOT NULL,
  requestId     TEXT NOT NULL,
  threadId      TEXT,
  turnId        TEXT,
  scope         TEXT,
  userId        TEXT NOT NULL,
  chatId        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','denied','expired')),
  createdAt     INTEGER NOT NULL,
  expiresAt     INTEGER NOT NULL,
  usedAt        INTEGER
);

CREATE TABLE IF NOT EXISTS inbox (
  tenant        TEXT NOT NULL,
  chatId        TEXT NOT NULL,
  messageId     TEXT NOT NULL,
  senderId      TEXT NOT NULL,
  text          TEXT NOT NULL,
  receivedAt    INTEGER NOT NULL,
  dispatched    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant, chatId, messageId)
);

CREATE TABLE IF NOT EXISTS outbox (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  jobId         TEXT,
  chatId        TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  part          INTEGER NOT NULL DEFAULT 1,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','unknown')),
  createdAt     INTEGER NOT NULL,
  sentAt        INTEGER
);

CREATE INDEX IF NOT EXISTS idx_events_job ON events (jobId, seq);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox (status, chatId);
CREATE INDEX IF NOT EXISTS idx_approvals_job ON approvals (jobId);
`;
