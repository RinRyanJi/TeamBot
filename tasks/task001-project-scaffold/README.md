# task001 — Node + TypeScript project scaffold with build/typecheck/test harness

- Phase: 1
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Initialize an independent TeamBot Node/TypeScript project (package.json, tsconfig, npm scripts: build, typecheck, test). Add a test runner (node --test or vitest) and a trivial passing test to prove the harness runs.

## Acceptance (evidence-based)

npm run typecheck passes with 0 errors; npm test runs and reports at least 1 passing test; npm run build produces output.

## Required evidence (stored under evidence/)

- `typecheck.txt`
- `test.txt`
- `build.txt`

## Result

Completed. TeamBot Node/TypeScript project scaffolded:
- `package.json` (ESM, node>=22.18), `tsconfig.json` (typecheck) + `tsconfig.build.json` (emit to `dist/`).
- Test harness: Node built-in test runner with native `--experimental-strip-types` (no extra deps beyond `typescript` + `@types/node`).
- `src/index.ts` + `tests/smoke.test.ts` (3 tests).

Real verification (see `evidence/`):
- `typecheck.txt` — `tsc --noEmit` exits clean, 0 errors.
- `test.txt` — `node --test` reports `# pass 3 / # fail 0`.
- `build.txt` — `tsc -p tsconfig.build.json` emits `dist/index.js` + `dist/index.d.ts`.

Commit: recorded on push (see git log).
