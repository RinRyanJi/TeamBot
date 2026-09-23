// Typed storage layer over the built-in node:sqlite (requires --experimental-sqlite).
// Transactional writes; single source of local state (architecture §6/§7/§8).
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.ts";

export interface Pairing {
  id: string;
  tenant: string;
  account: string;
  chatId: string;
  kind: "self" | "group";
  allowlist: string[];
  projects: string[];
  baselineMessageId?: string | null;
  baselineAt?: number | null;
  createdAt: number;
}

export interface Job {
  jobId: string;
  chatId: string;
  senderId: string;
  projectId: string;
  cwd: string;
  threadId: string | null;
  activeTurnId: string | null;
  status: string;
  createdAt: number;
  lastEventAt: number | null;
  lastResult: string | null;
}

export interface Approval {
  code: string;
  jobId: string;
  requestId: string;
  threadId: string | null;
  turnId: string | null;
  scope: string | null;
  userId: string;
  chatId: string;
  status: "pending" | "approved" | "denied" | "expired";
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
}

export interface InboxMessage {
  tenant: string;
  chatId: string;
  messageId: string;
  senderId: string;
  text: string;
  receivedAt: number;
}

export interface OutboxRow {
  id: number;
  jobId: string | null;
  chatId: string;
  seq: number;
  part: number;
  body: string;
  status: "pending" | "sent" | "unknown";
  createdAt: number;
  sentAt: number | null;
}

export class Store {
  private db: DatabaseSync;
  private txDepth = 0;
  private spCounter = 0;

  constructor(location = ":memory:") {
    this.db = new DatabaseSync(location);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA_SQL);
    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  get schemaVersion(): number {
    const row = this.db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    return row.user_version;
  }

  /**
   * Run fn inside a transaction; rolls back on throw. Reentrant: nested calls
   * use SAVEPOINTs so a helper that opens its own transaction composes safely
   * inside an outer transaction (SQLite cannot nest BEGIN).
   */
  transaction<T>(fn: () => T): T {
    const top = this.txDepth === 0;
    const name = `sp_${this.spCounter++}`;
    this.db.exec(top ? "BEGIN" : `SAVEPOINT ${name}`);
    this.txDepth++;
    try {
      const result = fn();
      this.txDepth--;
      this.db.exec(top ? "COMMIT" : `RELEASE ${name}`);
      return result;
    } catch (err) {
      this.txDepth--;
      if (top) {
        this.db.exec("ROLLBACK");
      } else {
        this.db.exec(`ROLLBACK TO ${name}`);
        this.db.exec(`RELEASE ${name}`);
      }
      throw err;
    }
  }

  close(): void {
    this.db.close();
  }

  // --- pairings ---
  upsertPairing(p: Pairing): void {
    this.db
      .prepare(
        `INSERT INTO pairings (id,tenant,account,chatId,kind,allowlist,projects,baselineMessageId,baselineAt,createdAt)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(tenant,chatId) DO UPDATE SET
           account=excluded.account, kind=excluded.kind, allowlist=excluded.allowlist,
           projects=excluded.projects, baselineMessageId=excluded.baselineMessageId,
           baselineAt=excluded.baselineAt`,
      )
      .run(
        p.id,
        p.tenant,
        p.account,
        p.chatId,
        p.kind,
        JSON.stringify(p.allowlist),
        JSON.stringify(p.projects),
        p.baselineMessageId ?? null,
        p.baselineAt ?? null,
        p.createdAt,
      );
  }

  getPairing(tenant: string, chatId: string): Pairing | undefined {
    const row = this.db
      .prepare("SELECT * FROM pairings WHERE tenant=? AND chatId=?")
      .get(tenant, chatId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: row.id as string,
      tenant: row.tenant as string,
      account: row.account as string,
      chatId: row.chatId as string,
      kind: row.kind as "self" | "group",
      allowlist: JSON.parse(row.allowlist as string) as string[],
      projects: JSON.parse(row.projects as string) as string[],
      baselineMessageId: (row.baselineMessageId as string | null) ?? null,
      baselineAt: (row.baselineAt as number | null) ?? null,
      createdAt: row.createdAt as number,
    };
  }

  // --- inbox (dedup) ---
  /** Insert if new. Returns true when this (tenant,chatId,messageId) was not seen before. */
  insertInboxIfNew(m: InboxMessage): boolean {
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO inbox (tenant,chatId,messageId,senderId,text,receivedAt,dispatched)
         VALUES (?,?,?,?,?,?,0)`,
      )
      .run(m.tenant, m.chatId, m.messageId, m.senderId, m.text, m.receivedAt);
    return res.changes === 1;
  }

  markDispatched(tenant: string, chatId: string, messageId: string): void {
    this.db
      .prepare(
        "UPDATE inbox SET dispatched=1 WHERE tenant=? AND chatId=? AND messageId=?",
      )
      .run(tenant, chatId, messageId);
  }

  isDispatched(tenant: string, chatId: string, messageId: string): boolean {
    const row = this.db
      .prepare(
        "SELECT dispatched FROM inbox WHERE tenant=? AND chatId=? AND messageId=?",
      )
      .get(tenant, chatId, messageId) as { dispatched: number } | undefined;
    return row?.dispatched === 1;
  }

  // --- jobs ---
  createJob(
    j: Omit<Job, "threadId" | "activeTurnId" | "lastEventAt" | "lastResult"> &
      Partial<Pick<Job, "threadId" | "activeTurnId">>,
  ): void {
    this.db
      .prepare(
        `INSERT INTO jobs (jobId,chatId,senderId,projectId,cwd,threadId,activeTurnId,status,createdAt,lastEventAt,lastResult)
         VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL)`,
      )
      .run(
        j.jobId,
        j.chatId,
        j.senderId,
        j.projectId,
        j.cwd,
        j.threadId ?? null,
        j.activeTurnId ?? null,
        j.status,
        j.createdAt,
      );
  }

  getJob(jobId: string): Job | undefined {
    const row = this.db
      .prepare("SELECT * FROM jobs WHERE jobId=?")
      .get(jobId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      jobId: row.jobId as string,
      chatId: row.chatId as string,
      senderId: row.senderId as string,
      projectId: row.projectId as string,
      cwd: row.cwd as string,
      threadId: (row.threadId as string | null) ?? null,
      activeTurnId: (row.activeTurnId as string | null) ?? null,
      status: row.status as string,
      createdAt: row.createdAt as number,
      lastEventAt: (row.lastEventAt as number | null) ?? null,
      lastResult: (row.lastResult as string | null) ?? null,
    };
  }

  updateJobStatus(jobId: string, status: string, lastResult?: string): void {
    this.db
      .prepare(
        "UPDATE jobs SET status=?, lastResult=COALESCE(?, lastResult) WHERE jobId=?",
      )
      .run(status, lastResult ?? null, jobId);
  }

  setJobThread(jobId: string, threadId: string, activeTurnId?: string): void {
    this.db
      .prepare("UPDATE jobs SET threadId=?, activeTurnId=? WHERE jobId=?")
      .run(threadId, activeTurnId ?? null, jobId);
  }

  // --- events ---
  appendEvent(
    jobId: string,
    seq: number,
    kind: string,
    payload: unknown,
    at: number,
  ): void {
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO events (jobId,seq,kind,payload,createdAt) VALUES (?,?,?,?,?)",
        )
        .run(jobId, seq, kind, payload == null ? null : JSON.stringify(payload), at);
      this.db.prepare("UPDATE jobs SET lastEventAt=? WHERE jobId=?").run(at, jobId);
    });
  }

  listEvents(jobId: string): Array<{ seq: number; kind: string; payload: unknown }> {
    const rows = this.db
      .prepare("SELECT seq,kind,payload FROM events WHERE jobId=? ORDER BY seq")
      .all(jobId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      seq: r.seq as number,
      kind: r.kind as string,
      payload: r.payload == null ? null : JSON.parse(r.payload as string),
    }));
  }

  // --- approvals ---
  createApproval(a: Approval): void {
    this.db
      .prepare(
        `INSERT INTO approvals (code,jobId,requestId,threadId,turnId,scope,userId,chatId,status,createdAt,expiresAt,usedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        a.code,
        a.jobId,
        a.requestId,
        a.threadId ?? null,
        a.turnId ?? null,
        a.scope ?? null,
        a.userId,
        a.chatId,
        a.status,
        a.createdAt,
        a.expiresAt,
        a.usedAt ?? null,
      );
  }

  getApproval(code: string): Approval | undefined {
    const row = this.db
      .prepare("SELECT * FROM approvals WHERE code=?")
      .get(code) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      code: row.code as string,
      jobId: row.jobId as string,
      requestId: row.requestId as string,
      threadId: (row.threadId as string | null) ?? null,
      turnId: (row.turnId as string | null) ?? null,
      scope: (row.scope as string | null) ?? null,
      userId: row.userId as string,
      chatId: row.chatId as string,
      status: row.status as Approval["status"],
      createdAt: row.createdAt as number,
      expiresAt: row.expiresAt as number,
      usedAt: (row.usedAt as number | null) ?? null,
    };
  }

  setApprovalStatus(
    code: string,
    status: Approval["status"],
    usedAt?: number,
  ): void {
    this.db
      .prepare("UPDATE approvals SET status=?, usedAt=COALESCE(?, usedAt) WHERE code=?")
      .run(status, usedAt ?? null, code);
  }

  // --- outbox ---
  enqueueOutbox(
    row: Omit<OutboxRow, "id" | "status" | "sentAt">,
  ): number {
    const res = this.db
      .prepare(
        `INSERT INTO outbox (jobId,chatId,seq,part,body,status,createdAt,sentAt)
         VALUES (?,?,?,?,?, 'pending', ?, NULL)`,
      )
      .run(
        row.jobId ?? null,
        row.chatId,
        row.seq,
        row.part,
        row.body,
        row.createdAt,
      );
    return Number(res.lastInsertRowid);
  }

  listPendingOutbox(chatId?: string): OutboxRow[] {
    return this.listOutboxByStatus("pending", chatId);
  }

  listOutboxByStatus(
    status: OutboxRow["status"],
    chatId?: string,
  ): OutboxRow[] {
    const rows = (
      chatId
        ? this.db
            .prepare(
              "SELECT * FROM outbox WHERE status=? AND chatId=? ORDER BY id",
            )
            .all(status, chatId)
        : this.db
            .prepare("SELECT * FROM outbox WHERE status=? ORDER BY id")
            .all(status)
    ) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as number,
      jobId: (r.jobId as string | null) ?? null,
      chatId: r.chatId as string,
      seq: r.seq as number,
      part: r.part as number,
      body: r.body as string,
      status: r.status as OutboxRow["status"],
      createdAt: r.createdAt as number,
      sentAt: (r.sentAt as number | null) ?? null,
    }));
  }

  setOutboxStatus(
    id: number,
    status: OutboxRow["status"],
    sentAt?: number,
  ): void {
    this.db
      .prepare("UPDATE outbox SET status=?, sentAt=COALESCE(?, sentAt) WHERE id=?")
      .run(status, sentAt ?? null, id);
  }
}
