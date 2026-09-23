# task005 — !tb command parser and ID naming (T/A/Q)

- Phase: 1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Fixed parser for !tb commands (help, projects, run, status, continue, steer, stop, approve, deny, answer, result). Case-insensitive prefix normalization. ID naming per architecture (T=job, A=approval, Q=question).

## Acceptance (evidence-based)

Parser unit tests cover every command, malformed input, and that a [TB ...] report line is NOT parsed as a command.

## Required evidence (stored under evidence/)

- `parser-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
