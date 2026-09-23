// Redacted diagnostics export (architecture §8). The export never contains tokens,
// cookies, or a full environment dump.
import { writeFileSync } from "node:fs";
import { buildDiagnostics } from "../util/redact.ts";

export interface DiagnosticsInput {
  version: string;
  platform: string;
  [k: string]: unknown;
}

/** Build a redacted diagnostics object safe to share. */
export function exportDiagnostics(input: DiagnosticsInput): Record<string, unknown> {
  return buildDiagnostics(input);
}

/** Write a redacted diagnostics JSON file. Returns the serialized content. */
export function writeDiagnostics(filePath: string, input: DiagnosticsInput): string {
  const json = JSON.stringify(exportDiagnostics(input), null, 2);
  writeFileSync(filePath, json, "utf8");
  return json;
}
