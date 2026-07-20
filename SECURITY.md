# Security policy

## Supported version

Security fixes are applied to the current `1.x` line in this repository. Older
snapshots and copied fixture variants are not maintained as separate releases.

## Reporting a vulnerability

Report suspected vulnerabilities privately through the repository host's
private vulnerability-reporting channel when available. If that channel is not
enabled, contact the repository owner privately through the same host. Do not
open a public issue containing exploit details, credentials, personal data, or
unsanitized evidence.

Include the affected commit, operating system, Node.js version, reproduction
steps, impact, and the smallest safe proof of concept. Synthetic data is
preferred. Maintainers should acknowledge the report, validate it, coordinate
a fix, and disclose it publicly only after affected users have a reasonable
update path.

## Deployment and data boundary

AccessPatch EU is a local demonstration, not a hosted scanning service. Its
checked-in target is the synthetic, unauthenticated checkout at
`http://127.0.0.1:4173/checkout`. The deterministic judge path requires no
login and no OpenAI Platform API key. The repository does not read Codex
credential files, browser account data, tokens, or unrelated environment
variables.

Do not adapt the fixture workflow to a production account, remote site,
customer session, or payment flow without a separate threat model and explicit
authorization.

## Implemented controls

- Configuration accepts only unauthenticated loopback HTTP(S) targets.
- Scanner browser contexts block service workers and reject external HTTP and
  WebSocket requests.
- Blocked URLs are reduced to sanitized origins before entering diagnostics.
- Form-control values, selected options, and checked state are cleared before
  sanitized DOM evidence is written.
- Evidence paths are repository-relative, run-scoped, phase-scoped, and checked
  against canonical filesystem containment.
- Interactive runs require a clean worktree and pin the baseline Git commit.
- Proposals are limited to candidates below `src/checkout`; an interactive
  patch requires explicit actor `human` approval.
- Verification includes tracked, renamed, and untracked files and rejects any
  path outside the approved candidate set.
- Manifest updates use validation, repository-local locks, fsync, atomic
  rename, revision checks, and explicit cleanup.
- Deterministic fixture approval is labeled `test_fixture` and cannot be
  confused with genuine human approval by the run schema.

## Evidence handling

The scanner deliberately writes screenshots, traces, DOM, ARIA snapshots, axe
output, keyboard traces, and a source diff under `public/runs`. Form fields are
scrubbed before the DOM and element excerpts are captured, but screenshots,
accessibility trees, traces, page copy, and source diffs may still contain
information visible to the browser.

Use only the checked-in synthetic data. Review every artifact before sharing
it, keep generated runs out of public deployments unless intentionally
published, and delete local evidence according to the surrounding project's
retention policy.

## Dependency and CI hygiene

Install exactly the versions in `package-lock.json` with `npm ci`. Review
dependency updates, preserve the lockfile, run the full documented test gates,
and inspect `THIRD_PARTY_NOTICES.md` when package versions or licenses change.
CI permissions are read-only and the test workflow does not require repository
secrets.

## Scope limitation

AccessPatch EU produces technical remediation evidence, not legal advice,
certification, or a guarantee of EAA/WCAG compliance. AI-proposed patches
require human review.

A local verification receipt does not establish that an arbitrary application
is secure, accessible, or free of sensitive data. It proves only the bounded
fixture evidence, approved diff, and deterministic checks represented in that
receipt.
