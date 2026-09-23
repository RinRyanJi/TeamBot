// Explicit-quit coordination (architecture §7): closing the main window minimizes to
// the tray; only an explicit quit stops accepting new work and drains running jobs
// before exiting. This is the testable core; the Electron main wires it to the tray.

export interface QuitCoordinatorOptions {
  pollMs?: number;
  /** Injectable sleep for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export interface DrainResult {
  drained: boolean;
  remaining: string[];
}

export class QuitCoordinator {
  private accepting = true;
  private getRunning: () => string[];
  private pollMs: number;
  private sleep: (ms: number) => Promise<void>;
  private now: () => number;

  constructor(getRunningJobIds: () => string[], opts: QuitCoordinatorOptions = {}) {
    this.getRunning = getRunningJobIds;
    this.pollMs = opts.pollMs ?? 100;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? (() => Date.now());
  }

  isAccepting(): boolean {
    return this.accepting;
  }

  /** Stop accepting new work (called at the start of an explicit quit). */
  stopAccepting(): void {
    this.accepting = false;
  }

  /**
   * Stop accepting new work, then wait for running jobs to finish (up to timeoutMs).
   * Returns whether everything drained and any jobs still running at timeout.
   */
  async drain(timeoutMs: number): Promise<DrainResult> {
    this.accepting = false;
    const start = this.now();
    while (this.getRunning().length > 0 && this.now() - start < timeoutMs) {
      await this.sleep(this.pollMs);
    }
    const remaining = this.getRunning();
    return { drained: remaining.length === 0, remaining };
  }
}
