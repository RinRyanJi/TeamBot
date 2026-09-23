// Browser Host security configuration (architecture §2/§9).
// The Teams surface is a remote page and must run with NO Node integration and NO
// preload: context-isolated, sandboxed, in a dedicated persistent partition. The
// control endpoint is loopback-only. These are pure, testable factories so the
// security posture is asserted by unit tests, independent of Electron being present.

export interface RemoteWebPreferences {
  nodeIntegration: false;
  contextIsolation: true;
  sandbox: true;
  webSecurity: true;
  /** No preload is exposed to the remote Teams page. */
  preload: undefined;
  partition: string;
}

export const TEAMS_PARTITION = "persist:teambot-teams";

export function partitionForChat(chatId: string): string {
  // All conversations share the login partition but are read/written by chatId.
  // (Architecture §5: shared login partition, per-surface chatId checks.)
  return TEAMS_PARTITION + (chatId ? `#${chatId}` : "");
}

/** webPreferences for the remote Teams WebContentsView. */
export function remoteWebPreferences(
  partition: string = TEAMS_PARTITION,
): RemoteWebPreferences {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    preload: undefined,
    partition,
  };
}

/** Throw if a webPreferences object would expose Node/preload to a remote page. */
export function assertRemoteIsIsolated(prefs: {
  nodeIntegration?: unknown;
  contextIsolation?: unknown;
  sandbox?: unknown;
  preload?: unknown;
}): void {
  if (prefs.nodeIntegration === true) throw new Error("nodeIntegration must be false for remote pages");
  if (prefs.contextIsolation === false) throw new Error("contextIsolation must be true");
  if (prefs.sandbox === false) throw new Error("sandbox must be true for remote pages");
  if (prefs.preload) throw new Error("remote pages must not have a preload");
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

/** The browser control endpoint must bind loopback only — never exposed off-box. */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(host);
}
