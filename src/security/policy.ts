// Switchable execution posture (product-brainstorm roadmap A).
// Default is read-only; `unlock(durationMs)` temporarily switches to workspace-write
// until it expires; `lock()` reverts immediately. The effective sandbox is always
// computed against the clock, so an expired unlock silently falls back to read-only.
export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export class SecurityPolicy {
  private baseMode: SandboxMode;
  private unlockedUntil = 0;
  private killed = false;

  constructor(baseMode: SandboxMode = "read-only") {
    this.baseMode = baseMode;
  }

  /** Temporarily allow workspace-write until now+durationMs. */
  unlock(durationMs: number, now: number): void {
    this.unlockedUntil = now + Math.max(0, durationMs);
  }

  /** Revert to the base (read-only) posture immediately. */
  lock(): void {
    this.unlockedUntil = 0;
  }

  /** Hard stop: nothing runs until a new session. */
  kill(): void {
    this.killed = true;
    this.unlockedUntil = 0;
  }

  isKilled(): boolean {
    return this.killed;
  }

  isUnlocked(now: number): boolean {
    return !this.killed && now < this.unlockedUntil;
  }

  /** Milliseconds remaining on the current unlock (0 if locked/expired). */
  unlockRemaining(now: number): number {
    return this.isUnlocked(now) ? this.unlockedUntil - now : 0;
  }

  /** The sandbox mode to pass to Codex for a turn started now. */
  effectiveSandbox(now: number): SandboxMode {
    if (this.killed) return "read-only";
    if (this.isUnlocked(now)) return "workspace-write";
    return this.baseMode === "read-only" ? "read-only" : this.baseMode;
  }
}
