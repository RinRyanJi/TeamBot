# task013 — Phase 2 interactive control: continue/steer/stop/approve/deny/answer

- Phase: 2
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Add continue, steer, stop, approve, deny, answer with idempotent inbox, duplicate/expired approval handling, stop-vs-actually-stopped distinction, approval codes bound per §5.

## Acceptance (evidence-based)

Tests: mid-run query/steer/answer; wrong-source/expired approval rejected without affecting the turn; stopping vs cancelled distinguished; dangerous-op approval routed to self-chat.

## Required evidence (stored under evidence/)

- `phase2-interactive-test.txt`

## Result

Completed.
- `src/router/approvals.ts` — `ApprovalManager` binds each code to operation/requestId/
  thread/turn/user/conversation with TTL + one-time use; `resolve()` rejects
  unknown/expired/used/wrong-conversation/not-authorized WITHOUT mutating turn state.
- `src/router/approval-routing.ts` — dangerous-scope approvals in a group route to the
  initiator's self-chat (isolated); safe ones stay in place.
- `src/supervisor/turn-control.ts` — `TurnControl` drives a live turn: mid-run `steer`,
  `stop` (marks `stopping` immediately, `cancelled` only after the turn actually ends),
  and `answer` for input requests; one active turn per thread.

Real verification (`evidence/phase2-interactive-test.txt`): 10/10 —
approvals: unknown/wrong-conversation(+turn unaffected)/non-initiator/admin-ok/
one-time-used/expired(+later used, turn unaffected)/dangerous→self-chat vs safe→group;
turn-control: stop shows `stopping` then `cancelled` (distinct), mid-run steer shapes the
completion, and answer resolves a mid-run input request to completion. Full suite 68/68.

Note: parser already covers continue/steer/stop/approve/deny/answer (task005) and the
router gates them (task006); this task adds the runtime semantics + approval security.
Wiring these into the Coordinator's live loop is exercised further in task014.

Commit: recorded on push (see git log).
