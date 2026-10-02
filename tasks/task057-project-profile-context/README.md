# task057 — Project profiles and per-conversation active context

- Phase: P0
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Implement the v4 Project Profile and conversation context model. A project must be selected explicitly when context is ambiguous; the phone never submits cwd. Add focus/projects behavior and context expiry.

## Acceptance (evidence-based)

Tests prove registered project selection, alias collision rejection, context expiry, ambiguous run clarification, and no arbitrary cwd from Teams.

## Required evidence (stored under evidence/)

- `project-context-test.txt`

## Result

Completed. `ProjectRegistry`, `ConversationContextStore`, persistent Store context, v4 parsing, and coordinator focus/run resolution now enforce registered project IDs, per-chat focus, ambiguity prompts, and a 30-minute expiry. See [project-context-test.txt](evidence/project-context-test.txt).
