# task032 — R7a: path wall attribution + sandbox bypass tests

- Phase: G1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Reframe the path wall as Codex sandbox writableRoots (TeamBot does not re-implement it). Add bypass tests against the sandbox's real write behavior: .. / absolute-outside / UNC / junction / %VAR%; CI builds a junction pointing to C:\ and asserts writes are denied.

## Acceptance (evidence-based)

Bypass test suite runs against actual sandbox write behavior; each bypass is denied; evidence captured. §8/§9 'outside-AgentHub = 0' only claimed after this.

## Required evidence (stored under evidence/)

- `sandbox-bypass-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
