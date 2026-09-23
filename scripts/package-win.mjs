// Windows packaging: build TypeScript, then produce a portable ZIP artifact of the
// app under release/. This is the portable-package step; a signed NSIS installer via
// electron-builder is the future full-installer step (documented in docs/settings.md).
//
// Usage: node scripts/package-win.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, statSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;
const outDir = join(root, "release");
const artifact = join(outDir, `TeamBot-${version}-win.zip`);

console.log("[package] building TypeScript...");
execFileSync("npm", ["run", "build"], { stdio: "inherit", shell: process.platform === "win32" });

mkdirSync(outDir, { recursive: true });
rmSync(artifact, { force: true });

// Include the built output, the Electron launcher, and manifest.
const items = ["dist", "launcher", "package.json", "README.md"].filter((p) =>
  existsSync(join(root, p)),
);
console.log(`[package] zipping: ${items.join(", ")}`);

// Use PowerShell Compress-Archive (native on Windows) to make a real artifact.
const psItems = items.map((p) => `'${p}'`).join(",");
execFileSync(
  "powershell",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Compress-Archive -Path ${psItems} -DestinationPath '${artifact}' -Force`,
  ],
  { stdio: "inherit" },
);

if (!existsSync(artifact)) {
  console.error("[package] FAILED: artifact not produced");
  process.exit(1);
}
const size = statSync(artifact).size;
console.log(`[package] OK -> ${artifact} (${size} bytes)`);
