// SQLite schema for TeamBot local state (architecture §6/§7/§8).
// Applied by Store on open; versioned via PRAGMA user_version for future migrations.

export const SCHEMA_VERSION = 2;

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

CREATE TABLE IF NOT EXISTS session (
  key           TEXT PRIMARY KEY,           -- e.g. residentThreadId
  value         TEXT NOT NULL,
  at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sent_results (
  turnId        TEXT PRIMARY KEY,           -- one authoritative result per turn (idempotent)
  chatId        TEXT NOT NULL,
  teamsMessageId TEXT,
  at            INTEGER NOT NULL
);

-- Append-only security audit log (R9 / PRD §6.4). Every deny/allow/whitelist
-- decision is recorded; command text is stored already-redacted. Triggers make
-- the table tamper-evident: UPDATE and DELETE are rejected at the DB level.
CREATE TABLE IF NOT EXISTS audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            INTEGER NOT NULL,
  senderId      TEXT NOT NULL DEFAULT '',
  conversation  TEXT NOT NULL DEFAULT '',
  projectId     TEXT NOT NULL DEFAULT '',
  decision      TEXT NOT NULL CHECK (decision IN ('deny','allow','whitelist-add','whitelist-remove','approve','deny-approval')),
  rule          TEXT NOT NULL DEFAULT '',       -- which rule matched (e.g. 'path-wall','blacklist:destructive','whitelist')
  command       TEXT NOT NULL DEFAULT ''        -- redacted command/scope text
);

CREATE TRIGGER IF NOT EXISTS audit_no_update
  BEFORE UPDATE ON audit
  BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;

CREATE TRIGGER IF NOT EXISTS audit_no_delete
  BEFORE DELETE ON audit
  BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;

-- Per-project command whitelist (R7d). Precise patterns only; grown by ok-forever.
-- projectId keyed from day one (even when single-valued) so multi-project needs no migration.
CREATE TABLE IF NOT EXISTS whitelist (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  projectId     TEXT NOT NULL,
  pattern       TEXT NOT NULL,                  -- exact command pattern (no wildcards)
  addedBy       TEXT NOT NULL DEFAULT '',
  addedAt       INTEGER NOT NULL,
  expiresAt     INTEGER,                        -- NULL = no TTL
  lastHitAt     INTEGER,
  UNIQUE (projectId, pattern)
);

CREATE INDEX IF NOT EXISTS idx_events_job ON events (jobId, seq);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox (status, chatId);
CREATE INDEX IF NOT EXISTS idx_approvals_job ON approvals (jobId);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit (at);
CREATE INDEX IF NOT EXISTS idx_whitelist_project ON whitelist (projectId);
`;
