# Testing AccessPatch EU

## Clean-clone setup

Install Node.js 24.18.0 or newer, npm, Git, and Playwright Chromium. From the
repository root:

```bash
npm ci
npx playwright install chromium
```

On a Linux workstation that does not already have Chromium system libraries,
use:

```bash
npx playwright install --with-deps chromium
```

No login and no OpenAI Platform API key are required for any deterministic
test or judge command.

## Standard gates

Run the non-media gates from the repository root:

```bash
node scripts/secret-scan.mjs
npm run typecheck
npm test
npm run test:e2e
npm run build
```

The expected result is that every command exits with status zero. The
deterministic judge workflow has its own visible receipt:

```bash
npm run demo:verify
npm run judge
```

Expected output from the workflow:

```text
AccessPatch verification: PASS
```

The local submission package can be checked separately:

```bash
npm run submission:check
```

External Devpost and YouTube URLs are explicit account handoffs; their absence
does not excuse a missing or invalid local artifact.

## Gate responsibilities

| Gate | What it checks |
| --- | --- |
| `node scripts/secret-scan.mjs` | Text files do not contain supported secret-like credential patterns. |
| `npm run typecheck` | Strict TypeScript contracts across `src`, `tools`, tests, and build/test configuration. |
| `npm test` | Vitest unit tests under `tests/unit/**/*.test.ts`. |
| `npm run test:e2e` | Playwright tests under `tests/e2e` against the local Vite server. |
| `npm run build` | The React application produces a Vite production build. |
| `npm run demo:verify` | The complete deterministic fixture state machine passes and restores source bytes. |
| `npm run submission:check` | Required documents/media metadata, asset coverage, unfinished copy, and secret-like text. |

## Unit-test coverage

The unit suite checks:

- strict configuration and loopback-only targets;
- run-manifest topology, phase/run path binding, sorted identities, approval
  actors, and honest terminal states;
- stable finding construction from both runtime signals and source markers;
- proposal completeness and the sole approval/rejection transitions;
- deterministic verifier pass and failure conditions;
- Git status parsing, rename/untracked coverage, baseline drift, and candidate
  allowlisting;
- canonical filesystem containment, including junction escape rejection;
- atomic manifest publication, compare-and-swap behavior, locks, and cleanup
  error preservation;
- exact-byte fixture reset and failure-safe replacement;
- browser lifecycle and loopback HTTP/WebSocket policy;
- CLI stdout/stderr behavior, command discovery, and judge copy;
- dashboard models for passed, missing, and corrupt manifests;
- plugin discovery and safety-contract content;
- documentation and submission-package contracts.

Vitest is intentionally restricted to `tests/unit` so it cannot accidentally
collect Playwright specs.

## End-to-end coverage

Playwright starts `npm run dev` at `http://127.0.0.1:4173`. The configuration
uses one worker with global serialization because fixture and scanner tests
mutate repository-local state. In CI it starts a fresh server; locally it may
reuse an already-running server.

The end-to-end suite covers:

- the broken fixture's unnamed payment control and repeated-email focus trap;
- the repaired fixture's keyboard-only checkout completion and validation
  announcement;
- complete before/after scanner artifact publication;
- external HTTP and WebSocket blocking;
- form-value scrubbing in persisted artifacts;
- deterministic fixture orchestration and exact source restoration;
- passed dashboard keyboard access, axe checks, missing/corrupt states, and a
  375-pixel viewport.

Fixture-changing tests and `npm run demo:verify` use repository-local locks and
restore the original checkout in cleanup. Do not terminate the process
forcibly while it is publishing an artifact or swapping a fixture.

## CI

`.github/workflows/ci.yml` runs on Linux for pushes and pull requests. It uses
Node.js 24.18.0, installs the lockfile with `npm ci`, installs Playwright
Chromium and its operating-system dependencies, then runs typecheck, unit
tests, the production build, and Playwright end-to-end tests.

## Interpreting a pass

A green test run proves the checked-in contracts and synthetic fixture behavior
at that revision. The AccessPatch verifier additionally proves the evidence,
journey, and diff conditions recorded for one run. Neither result is a legal
compliance determination or a substitute for testing with disabled users,
assistive technologies, additional browsers, and the full production product.
