# task010 — Playwright Teams adapter against a local fixture page

- Phase: 0/1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Playwright adapter that reads new messages, confirms conversation identity, serializes sends and reconciles results — driven against a local HTML fixture emulating the Teams DOM (stable chat/message/sender IDs).

## Acceptance (evidence-based)

Playwright test against the fixture: reads a new message, extracts (chatId, messageId, senderId), sends a reply, reconciles it. Serialized single-writer verified.

## Required evidence (stored under evidence/)

- `teams-fixture-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
