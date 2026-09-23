// Codex app-server stdio adapter (architecture §3).
// Speaks newline-delimited JSON to `codex app-server`:
//   request:      { method, id, params }
//   response:     { id, result } | { id, error }
//   notification: { method, params, emittedAtMs? }
//   server->client request (approvals/input): { method, id, params }  (needs a response)
// The adapter is the client; it owns the child process lifecycle.
import { EventEmitter } from "node:events";
import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

export interface SpawnLike {
  stdin: { write(chunk: string): void };
  stdout: EventEmitter;
  stderr: EventEmitter;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "exit", cb: (code: number | null) => void): void;
  kill(signal?: string): boolean;
  pid?: number | undefined;
}

export type SpawnFn = (
  command: string,
  args: string[],
  opts: { cwd?: string; shell: boolean },
) => SpawnLike;

export interface CodexAdapterOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  clientName?: string;
  clientVersion?: string;
  /** Injectable spawn for tests; defaults to node:child_process.spawn. */
  spawn?: SpawnFn;
}

export interface InitializeResult {
  userAgent?: string;
  codexHome?: string;
  platformOs?: string;
  [k: string]: unknown;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  method: string;
}

const defaultSpawn: SpawnFn = (command, args, opts) =>
  nodeSpawn(command, args, {
    cwd: opts.cwd,
    shell: opts.shell,
    stdio: ["pipe", "pipe", "pipe"],
  }) as unknown as ChildProcessWithoutNullStreams as unknown as SpawnLike;

/**
 * Emits:
 *  - "notification" (msg)         server notifications { method, params }
 *  - "serverRequest" (msg)        server->client requests needing a response (has id+method)
 *  - "exit" (code)
 *  - "stderr" (text)
 */
export class CodexAdapter extends EventEmitter {
  private opts: Required<Omit<CodexAdapterOptions, "cwd">> & { cwd?: string };
  private child: SpawnLike | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private buf = "";
  private exited = false;

  constructor(options: CodexAdapterOptions = {}) {
    super();
    this.opts = {
      command: options.command ?? "codex",
      args: options.args ?? ["app-server"],
      clientName: options.clientName ?? "teambot",
      clientVersion: options.clientVersion ?? "0.0.1",
      spawn: options.spawn ?? defaultSpawn,
      cwd: options.cwd,
    };
  }

  /** Spawn the server and complete the initialize/initialized handshake. */
  async start(): Promise<InitializeResult> {
    const child = this.opts.spawn(this.opts.command, this.opts.args, {
      cwd: this.opts.cwd,
      shell: process.platform === "win32",
    });
    this.child = child;

    child.stdout.on("data", (d: Buffer | string) => this.onData(d.toString()));
    child.stderr.on("data", (d: Buffer | string) =>
      this.emit("stderr", d.toString()),
    );
    child.on("error", (err) => this.failAll(err));
    child.on("exit", (code) => {
      this.exited = true;
      this.failAll(new Error(`codex app-server exited (code ${code})`));
      this.emit("exit", code);
    });

    const result = (await this.request("initialize", {
      clientInfo: { name: this.opts.clientName, version: this.opts.clientVersion },
    })) as InitializeResult;
    this.notify("initialized", {});
    return result;
  }

  private onData(chunk: string): void {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line.length === 0) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line) as Record<string, unknown>;
      } catch {
        this.emit("stderr", `unparseable line: ${line}`);
        continue;
      }
      this.dispatch(msg);
    }
  }

  private dispatch(msg: Record<string, unknown>): void {
    const hasId = typeof msg.id === "number";
    const hasMethod = typeof msg.method === "string";

    // Response to one of our requests.
    if (hasId && !hasMethod) {
      const pending = this.pending.get(msg.id as number);
      if (!pending) return;
      this.pending.delete(msg.id as number);
      if ("error" in msg && msg.error != null) {
        const e = msg.error as { message?: string; code?: number };
        pending.reject(
          new Error(`codex ${pending.method} error: ${e.message ?? JSON.stringify(e)}`),
        );
      } else {
        pending.resolve((msg as { result?: unknown }).result);
      }
      return;
    }

    // Server -> client request (needs a response, e.g. approvals / input).
    if (hasId && hasMethod) {
      this.emit("serverRequest", msg);
      return;
    }

    // Notification.
    if (hasMethod) {
      this.emit("notification", msg);
      this.emit(msg.method as string, (msg as { params?: unknown }).params);
    }
  }

  /** Send a request and await its response. */
  request(method: string, params?: unknown): Promise<unknown> {
    if (this.exited || !this.child) {
      return Promise.reject(new Error("codex app-server is not running"));
    }
    const id = this.nextId++;
    const payload: Record<string, unknown> = { method, id };
    if (params !== undefined) payload.params = params;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.child!.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  /** Send a notification (fire and forget). */
  notify(method: string, params?: unknown): void {
    if (!this.child) return;
    const payload: Record<string, unknown> = { method };
    if (params !== undefined) payload.params = params;
    this.child.stdin.write(JSON.stringify(payload) + "\n");
  }

  /** Respond to a server->client request by id. */
  respond(id: number, result: unknown): void {
    if (!this.child) return;
    this.child.stdin.write(JSON.stringify({ id, result }) + "\n");
  }

  // Convenience wrappers for the methods TeamBot uses.
  startThread(params: unknown): Promise<unknown> {
    return this.request("thread/start", params);
  }
  resumeThread(params: unknown): Promise<unknown> {
    return this.request("thread/resume", params);
  }
  startTurn(params: unknown): Promise<unknown> {
    return this.request("turn/start", params);
  }
  steer(params: unknown): Promise<unknown> {
    return this.request("turn/steer", params);
  }
  interrupt(params: unknown): Promise<unknown> {
    return this.request("turn/interrupt", params);
  }

  stop(): void {
    if (this.child && !this.exited) this.child.kill();
  }

  private failAll(err: Error): void {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }
}
