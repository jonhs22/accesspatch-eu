# AccessPatch EU architecture

## Purpose and trust model

AccessPatch EU is a localhost evidence-and-repair loop for a synthetic
checkout. It separates proposal generation from authority: GPT-5.6 correlates
bounded browser evidence with source, the human approves or rejects an
interactive proposal, and deterministic tests decide pass/fail.

Model output is therefore advisory. A passed `RunManifest` validated by the
repository schema and verifier is the proof surface consumed by the dashboard
and submission materials.

## Component map

| Area | Responsibility |
| --- | --- |
| `src/checkout` | Synthetic Lattice Supply checkout and the only editable product root. |
| `fixtures/broken-demo` | Frozen deliberately broken checkout used by reset and tests. |
| `fixtures/repaired-demo` | Frozen repair used only by deterministic fixture workflows and tests. |
| `tools/accesspatch` | CLI, scanner, state transitions, path/network guards, run store, and verifier. |
| `src/contracts/run.ts` | Strict Zod schemas for findings, evidence, approval, verification, errors, and the run manifest. |
| `public/runs/current.json` | Atomically published pointer and complete manifest for the current run. |
| `public/runs/runtime/<runId>` | Run-scoped before, after, and verification artifacts. |
| `src/dashboard` | Read-only presentation of valid, missing, or corrupt manifest state. |
| `plugins/accesspatch-eu` | Codex-facing workflow instructions and safety contract. |
| `scripts/demo-verify.mjs` | No-login deterministic fixture orchestration with exact-byte source restoration. |
| `tests` | Deterministic unit contracts and serial Playwright behavior checks. |

`src/App.tsx` selects `/accesspatch` for the evidence dashboard and renders the
checkout for `/checkout` and other local paths. The configured target is
`http://127.0.0.1:4173/checkout`; the dashboard is
`http://127.0.0.1:4173/accesspatch`.

## Workflow and authority

The manifest follows this principal path:

```text
scanning -> analyzing -> awaiting_approval -> patching -> verifying -> passed
                                                                    \-> failed
```

A rejection transitions directly from `awaiting_approval` to `failed` with
`APPROVAL_REJECTED`. Scanner failures and failed verification are persisted as
truthful terminal failure routes.

### Interactive mode

1. The CLI validates `accesspatch.config.json`, the project root, loopback
   target, and clean Git worktree.
2. The scanner captures baseline evidence and records the baseline commit.
3. GPT-5.6 may diagnose the observed stable findings and propose bounded source
   changes.
4. The proposal set must contain exactly one proposal for every baseline
   finding, with candidates below `src/checkout`.
5. The human decision is recorded with actor `human`. Source remains unchanged
   until explicit approval.
6. Verification checks the current Git head, full changed-file set, approved
   candidates, after evidence, and the frozen journey checks.

### Deterministic fixture mode

`npm run demo:verify` resets the broken fixture, starts Vite, scans the before
state, records generated fixture proposals with actor `test_fixture`, installs
the exact repaired fixture, scans the after state, verifies, and restores the
original source bytes. That provenance is suitable for a no-login judge
demonstration but is never represented as human approval.

## Evidence topology

Each phase writes six run-scoped artifacts:

```text
public/runs/runtime/<runId>/
  before/
    screenshot.png
    trace.zip
    dom.html
    aria.yml
    axe.json
    keyboard.json
  after/
    screenshot.png
    trace.zip
    dom.html
    aria.yml
    axe.json
    keyboard.json
  verification/
    diff.patch
```

The manifest binds every artifact path to the same safe run ID and declared
phase. Finding IDs, evidence paths, proposal candidates, changed files, and
journey checks are unique and deterministically sorted where the schema
requires it.

The scanner recognizes findings only when browser evidence and the matching
source marker are both present:

| Finding | Runtime signal | Source marker |
| --- | --- | --- |
| `AP-EU-001` | axe `button-name` violation on the payment action | `ACCESSPATCH-DEMO-001` |
| `AP-EU-002` | Five repeated focus targets during the Tab probe | `ACCESSPATCH-DEMO-002` |
| `AP-EU-003` | Visible error lacks alert/live-region semantics | `ACCESSPATCH-DEMO-003` |

## Deterministic pass conditions

The verifier, not the dashboard or model, requires all of the following:

- `AP-EU-001`, `AP-EU-002`, and `AP-EU-003` are resolved.
- The after phase contains exactly `checkout-completes`,
  `focus-escapes-email`, and `validation-announced`, all passing.
- Checkout confirmation is visible.
- No new serious or critical finding appears.
- A previously passing journey check has not regressed.
- Every changed path is an approved candidate below `src/checkout`.
- The diff artifact and all evidence remain scoped to the current run.

The strict run schema also prevents a `passed` manifest from carrying remaining
findings, regressions, failed journey state, out-of-allowlist changes, failure
reasons, or a workflow error.

## Persistence and concurrency

`RunStore` validates the complete manifest before writing it. It takes an
exclusive repository-local lock, writes and syncs a private temporary file,
and atomically renames it to `public/runs/current.json`. Updates use a
compare-and-swap expectation over run ID, revision, and status. Fixture swaps
use a separate lock, hash checks, atomic replacement, and independent cleanup
attempts.

## Network, privacy, and filesystem boundaries

- Configuration accepts only unauthenticated `http` or `https` URLs on
  `localhost` or `127.0.0.1`.
- Browser routing permits loopback traffic plus safe `data:`, `about:`, and
  loopback-origin `blob:` resources. External HTTP and WebSocket traffic is
  blocked, sanitized to origin-only diagnostics, and fails the scan.
- Service workers are disabled in the scanner context.
- Input, textarea, checkbox, and selected option state is cleared before DOM
  artifacts are written; scripts are excluded from the sanitized DOM.
- Canonical path and real-parent checks reject traversal, prefix collisions,
  unsafe Git paths, and directory-junction escapes.
- Interactive verification includes tracked, renamed, and untracked paths and
  fails if Git HEAD changes after the baseline.

These controls reduce risk for the synthetic demonstration. They do not make
the tool suitable for scanning real customer data or untrusted remote sites.
