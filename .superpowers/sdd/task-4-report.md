# Task 4 report — guard and verify approved repairs

Base: `d94d5dcbc0b74670e6fee66509fb2549217aea16`

## RED → GREEN evidence

The four new suites were written before their implementations. The initial focused run failed exactly because the modules did not exist:

```text
Cannot find module '../../tools/accesspatch/git-guard.js'
Cannot find module '../../tools/accesspatch/reset.js'
Cannot find module '../../tools/accesspatch/verifier.js'
Cannot find module '../../tools/accesspatch/approval.js'
```

After implementing the helpers, the focused command passed with 30 tests:

```text
npx vitest run tests/unit/workflow-state.test.ts tests/unit/git-guard.test.ts tests/unit/verifier.test.ts tests/unit/reset.test.ts
Test Files  4 passed (4)
Tests  30 passed (30)
```

## Files

- `tools/accesspatch/proposals.ts`: `analyzing → awaiting_approval`, one canonical checkout proposal per baseline finding.
- `tools/accesspatch/approval.ts`: actor-aware approval and the sole approval transition to `patching`; rejections become `APPROVAL_REJECTED` failures.
- `tools/accesspatch/git-guard.ts`: injected `spawn`-based Git runner, NUL parsing including renames, clean-worktree/HEAD checks, and product allowlist validation.
- `tools/accesspatch/verifier.ts`: strict verification receipt generation from before/after evidence, journey completion, regressions, and allowlist state.
- `tools/accesspatch/reset.ts`: exclusive-lock byte-copy reset with SHA-256 verification and failure-independent cleanup.
- `tools/accesspatch/scanner.ts`: uses the guard for interactive clean-start/baseline HEAD capture and detects HEAD drift during the after scan.
- `tests/unit/{workflow-state,git-guard,verifier,reset}.test.ts`: task-specific regression coverage.

## State transitions

- proposals: `analyzing → awaiting_approval`
- approved approval: `awaiting_approval → patching`
- rejected approval: `awaiting_approval → failed` (`APPROVAL_REJECTED`)
- existing after scan remains `patching → verifying`; no helper changes it to a terminal state.

## Verification commands

```text
npm test                  103 passed, 16 files passed
npm run test:e2e          6 passed
npm run typecheck         exit 0
npm run build             exit 0
git diff --check          exit 0
```

## Commit and concerns

Commit SHA before this report annotation: `41fbf12e14a2010b3ad275be74b943dd87e94117`.
The final commit SHA is returned in the task handoff (a Git commit cannot embed
its own final object ID without changing that ID).

No known task-scope concerns. CLI, dashboard, plugin, and RunStore persistence were intentionally left untouched.

## Review follow-up

The post-implementation review was addressed with a second strict RED → GREEN
cycle:

- tracked diffs are merged with NUL-delimited, non-ignored untracked paths;
- malformed/truncated NUL output and unknown status values fail closed;
- reset creates its fresh-clone lock parent, writes and syncs an exclusive
  same-directory temporary file, verifies its SHA-256, then atomically renames;
- reset failures preserve the live checkout and independently clean temporary
  and lock resources; and
- verification requires the exact frozen journey-check set and every required
  after check to pass.

Fresh focused verification after these fixes:

```text
Task 4 focused tests       40 passed, 4 files passed
All tracked unit tests    114 passed, 16 files passed
Global unit tests         132 passed, 18 files passed
Typecheck and build       exit 0
Task 4 diff check         exit 0
```

The follow-up commit SHA is reported in the task handoff.
