# Codex collaboration record

AccessPatch EU was built in one repository during OpenAI Build Week. Codex
implemented and tested the bounded workflow; the human selected the product
direction, approved the visual identity, and retained the approval decision for
the real interactive repair path.

| Timestamp | Task | Files / commit | Human decision | Verification |
| --- | --- | --- | --- | --- |
| 2026-07-20 | Product and evidence-loop design | `DESIGN.md`, `docs/superpowers/specs/2026-07-20-accesspatch-eu-design.md` | Chose a synthetic EU checkout and prohibited legal-certification claims | Design and plan review |
| 2026-07-20 | Contracts and repository bootstrap | `3be00ec`, `7270659` | Kept the target loopback-only and the editable root at `src/checkout` | Unit contracts and typecheck |
| 2026-07-20 | Broken and repaired checkout fixtures | `a114794` through `a07ef87` | Approved the three visible keyboard blockers and original visual direction | Playwright fixture tests |
| 2026-07-20 | Atomic scanner and privacy controls | `0c2588b` through `d94d5dc` | Required synthetic-only evidence and zero external requests | Scanner, privacy, and network tests |
| 2026-07-20 | Approval, Git guard, and verifier | `be13b70`, `d64a6c1` | Required explicit human approval for interactive edits | Forty focused Task 4 tests |
| 2026-07-20 | CLI and deterministic judge workflow | `2ba15bf` | Required `test_fixture` provenance to remain distinct from human approval | CLI contracts, demo E2E, signal cleanup, `demo:verify` PASS |
| 2026-07-20 | Evidence dashboard | `39e8357` | Approved evidence-first presentation with no invented metrics | Dashboard unit, accessibility, build |
| 2026-07-20 | Codex plugin | `e8c9ae7` | Kept installation account-local and outside automated validation | Plugin contract tests |
| 2026-07-20 | Submission and media production | Local submission artifacts | Human owns external publishing and final account actions | Submission validator, ffprobe when media is present |

## Division of responsibility

GPT-5.6 in the signed-in Codex workflow correlates bounded browser evidence
with source and proposes a small repair. A human decides whether an interactive
proposal may be applied. Deterministic Playwright, axe-core, schema, journey,
and Git-allowlist checks decide pass/fail; model output never decides its own
success.

The deterministic judge path deliberately records `runMode:
deterministic_fixture` and approval actor `test_fixture`. It is reproducible
test provenance, not a claim that a human approved that fixture copy.

## Feedback session

Feedback session retrieval is an explicit account handoff: in the primary
signed-in Codex task, the submitter runs `/feedback`, copies the returned
session identifier into the Devpost submission field, and then performs the
external submit action. Repository automation cannot truthfully retrieve or
publish that account-bound identifier.
