// Result reducer (product-brainstorm roadmap B).
// Fold a turn's events into ONE authoritative result: the final_answer text (ignoring
// interim commentary and deltas), the files changed, and the commands run. Kept pure so
// it is unit-testable independent of the live Codex wire format; the adapter normalizes
// raw events into TurnEvent before calling this.

export interface FileChange {
  path: string;
  added: number;
  removed: number;
}
export interface CommandRun {
  command: string;
  exitCode: number | null;
}

export type TurnEvent =
  | { kind: "agentMessage"; phase: "final_answer" | "commentary"; text: string }
  | { kind: "command"; command: string; exitCode: number | null }
  | { kind: "fileChange"; path: string; added: number; removed: number }
  | { kind: "diff"; files: FileChange[] };

export interface TurnResult {
  turnId: string;
  finalText: string;
  files: FileChange[];
  commands: CommandRun[];
}

export function reduceTurn(turnId: string, events: TurnEvent[]): TurnResult {
  let finalText = "";
  let lastAnyMessage = "";
  const commands: CommandRun[] = [];
  const fileMap = new Map<string, FileChange>();

  for (const e of events) {
    switch (e.kind) {
      case "agentMessage":
        if (e.text.trim()) {
          lastAnyMessage = e.text.trim();
          if (e.phase === "final_answer") finalText = e.text.trim();
        }
        break;
      case "command":
        commands.push({ command: e.command, exitCode: e.exitCode });
        break;
      case "fileChange":
        // fileChange contributes; a later diff snapshot (below) overrides counts.
        if (!fileMap.has(e.path)) fileMap.set(e.path, { path: e.path, added: e.added, removed: e.removed });
        break;
      case "diff":
        for (const f of e.files) fileMap.set(f.path, { ...f }); // diff snapshot wins
        break;
    }
  }

  // Fall back to the last assistant message if no explicit final_answer was seen.
  if (!finalText) finalText = lastAnyMessage;

  return {
    turnId,
    finalText,
    files: [...fileMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    commands,
  };
}

/** Two-tier summary: a one-line verdict, then details. */
export function formatResult(r: TurnResult): string {
  const verdict = `已完成 · ${r.files.length} 檔變更 · ${r.commands.length} 指令`;
  const lines: string[] = [verdict];
  if (r.finalText) lines.push(r.finalText);
  if (r.files.length) {
    lines.push(
      "檔案:" +
        r.files
          .map((f) => `${f.path} (+${f.added} −${f.removed})`)
          .slice(0, 20)
          .join("、"),
    );
  }
  const failed = r.commands.filter((c) => c.exitCode !== 0 && c.exitCode !== null);
  if (failed.length) {
    lines.push("失敗指令:" + failed.map((c) => `${c.command} (exit ${c.exitCode})`).join("、"));
  }
  return lines.join("\n");
}
