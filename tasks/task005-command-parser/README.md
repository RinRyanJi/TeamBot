# task005 — !tb command parser and ID naming (T/A/Q)

- Phase: 1
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Fixed parser for !tb commands (help, projects, run, status, continue, steer, stop, approve, deny, answer, result). Case-insensitive prefix normalization. ID naming per architecture (T=job, A=approval, Q=question).

## Acceptance (evidence-based)

Parser unit tests cover every command, malformed input, and that a [TB ...] report line is NOT parsed as a command.

## Required evidence (stored under evidence/)

- `parser-test.txt`

## Result

Completed. `src/router/parser.ts` `parseCommand(raw)` returns a discriminated
`Command` union or a typed failure (`not-a-command` / `unknown-command` /
`missing-args` / `bad-id`). Covers help, projects, run, status, continue, steer,
stop, approve, deny, answer, result. Case-insensitive `!tb` prefix + subcommand;
ID validators `isJobId`/`isApprovalId`/`isQuestionId` enforce T/A/Q naming.
Report lines beginning `[TB` are explicitly rejected so TeamBot's own self-chat
messages never loop back as commands; work-request free text is preserved verbatim.

Real verification (`evidence/parser-test.txt`): 9/9 tests — every command shape,
case-insensitivity, `[TB ...]` guard, prefixless chat rejection, and malformed-input
reasons (unknown/missing-args/bad-id). Full suite 27/27.

Commit: recorded on push (see git log).
