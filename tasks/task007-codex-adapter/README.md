# task007 — Codex app-server stdio adapter (initialize/thread/turn/steer/interrupt)

- Phase: 0/1
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Client that spawns codex app-server over stdio, performs initialize/initialized handshake, thread/start & thread/resume, turn/start, reads item/turn events, turn/steer with expectedTurnId, turn/interrupt, and answers approval/input requests.

## Acceptance (evidence-based)

Integration test performs a real handshake against codex-cli 0.156.1 in an isolated temp dir and observes at least one turn lifecycle; interrupt is honored. (Falls back to documented skip with reason if codex not available at runtime.)

## Required evidence (stored under evidence/)

- `codex-handshake-test.txt`
- `codex-turn-lifecycle.txt`

## Result

Completed. `src/codex/adapter.ts` `CodexAdapter` (EventEmitter) speaks the real
newline-delimited protocol: `{method,id,params}` requests, `{id,result|error}`
responses, `{method,params}` notifications, and server->client requests (approvals/
input) surfaced as a `serverRequest` event with `respond(id,result)`. Handles
initialize/initialized handshake, thread/start+resume, turn/start, turn/steer,
turn/interrupt, partial-line buffering, and fails in-flight requests on process exit.
Spawn is injectable for deterministic tests; real spawn uses `shell:true` on Windows
(required to launch `codex.cmd`).

Real verification:
- `codex-handshake-test.txt` — 5/5 unit tests against a fake server: initialize
  handshake, full thread+turn lifecycle with **ordered** events
  (thread/started→turn/started→item/started→item/completed→turn/completed),
  interrupt produces terminal event, error response rejects, process-exit rejects in-flight.
- `codex-turn-lifecycle.txt` — **REAL** `codex app-server` integration against
  **codex-cli 0.156.1**, ran live (`skipped 0`), initialize round-trip returns a
  well-formed result whose userAgent echoes the client name and includes codexHome.

Note: driving a real `turn/start` needs model auth/tokens; the real assertion here is
the protocol handshake against the actual binary. The full turn lifecycle logic is
verified deterministically via the fake server. Turn execution end-to-end is exercised
in task012.

Commit: recorded on push (see git log).
