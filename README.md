# AccessPatch EU

AccessPatch EU turns a synthetic inaccessible checkout into a reviewable,
source-bounded repair and a deterministic verification receipt.

Public repository: https://github.com/jonhs22/accesspatch-eu

[![CI](https://github.com/jonhs22/accesspatch-eu/actions/workflows/ci.yml/badge.svg)](https://github.com/jonhs22/accesspatch-eu/actions/workflows/ci.yml)

Public demo video: https://youtu.be/K0bKkyyBVIE

## Judge quick start

The public repository is the judge test build. The deterministic path requires
no login and no OpenAI Platform API key. It requires no account provisioning or
code generation, uses frozen local fixtures, labels approval provenance as
`test_fixture`, and does not present fixture approval as a human decision.

Prerequisites:

- Node.js 24.18.0 or newer
- npm
- Git
- Playwright Chromium

From a clean clone, run:

```bash
npm ci
npx playwright install chromium
npm run demo:verify
npm run judge
```

The expected terminal result is:

```text
AccessPatch verification: PASS
```

`npm run demo:verify` starts the local app, captures before evidence, records
deterministic fixture proposals and approval, installs the frozen repaired
fixture, captures after evidence, verifies the result, restores the original
checkout bytes, and stops the server. `npm run judge` prints the local URLs and
the same provenance information without leaving a server running.

To inspect the resulting receipt:

```bash
npm run dev
```

Open:

- Checkout: `http://127.0.0.1:4173/checkout`
- Evidence dashboard: `http://127.0.0.1:4173/accesspatch`

Two critical and one serious fixture blockers were resolved, no new serious or critical axe finding appeared, and the scripted keyboard checkout completed.

## What the demonstration proves

The deliberately broken Lattice Supply checkout contains three stable,
source-marked problems:

- `AP-EU-001`: the payment action has no accessible name.
- `AP-EU-002`: Tab focus repeats on the email field.
- `AP-EU-003`: visible validation is not announced to assistive technology.

The verifier passes only when all three IDs are resolved, the complete frozen
keyboard-check set passes, checkout confirmation is reached, no new serious or
critical axe finding appears, and every changed file is inside the approved
candidate allowlist under `src/checkout`.

All names, email addresses, order details, and payment interactions in this
repository are synthetic. The checkout does not process a payment and must not
be used with real customer or payment data.

## Codex, GPT-5.6, and the human decision

Codex built the React checkout and evidence dashboard, the repository-local
plugin, guarded CLI, persisted evidence contract, verification controls, test
suite, and submission tooling. The human chose the product scope, synthetic
fixture, visual direction, approval boundary, and whether an interactive patch
may be applied.

In the interactive workflow, GPT-5.6 correlates bounded browser evidence with
source and prepares repair proposals. It does not decide whether a proposal is
approved and it does not certify the result. Deterministic tests decide
pass/fail. The signed-in Codex client supplies the model experience; the
repository never reads Codex credentials and does not require an OpenAI
Platform API key.

## Interactive Codex workflow

The repository-local plugin exposes `$accesspatch-eu:accesspatch`. Add the local
marketplace from the repository root:

```text
codex plugin marketplace add .
```

Install `accesspatch-eu` through the Codex Plugins interface, then ask Codex to
run `$accesspatch-eu:accesspatch`. The workflow:

1. Requires an unauthenticated loopback target and a clean interactive
   worktree.
2. Captures browser, keyboard, axe, DOM, ARIA, screenshot, and trace evidence.
3. Correlates only observed evidence that has a stable source marker.
4. Records exactly one proposal per finding and pauses for explicit human
   approval.
5. Permits edits only to approved candidate files below `src/checkout`.
6. Replays the browser journey and lets the deterministic verifier produce the
   final receipt.

The full safety contract is in
[`plugins/accesspatch-eu/skills/accesspatch/SKILL.md`](plugins/accesspatch-eu/skills/accesspatch/SKILL.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite on `127.0.0.1:4173`. |
| `npm run build` | Create the production Vite build. |
| `npm run preview` | Preview the production build locally. |
| `npm run typecheck` | Run strict TypeScript checking without emitting files. |
| `npm test` | Run the Vitest unit suite. |
| `npm run test:e2e` | Run the serial non-media Playwright end-to-end suite. |
| `npm run test:media` | Producer-only validation of the local final MP4, captions, transcript, screenshots, and thumbnail. |
| `npm run accesspatch -- scan --phase before` | Start an interactive evidence run. |
| `npm run accesspatch -- scan --phase after` | Capture post-patch evidence. |
| `npm run accesspatch -- verify` | Produce a deterministic verification receipt. |
| `npm run reset:demo` | Restore the exact broken checkout fixture bytes. |
| `npm run demo:verify` | Run the complete no-login deterministic fixture demonstration. |
| `npm run judge` | Print the local judge path and expected result. |
| `npm run submission:check` | Validate the local submission package. |

The final MP4 is published through the public YouTube URL rather than the Git
clone, so `test:media` and `submission:check` are producer-side packaging gates,
not part of the clean-clone judge path.

See [`docs/testing.md`](docs/testing.md) for clean-clone and CI gates.

## Architecture

The browser scanner, persisted run manifest, explicit approval transition, Git
allowlist, and deterministic verifier form the trust boundary. The dashboard
renders the persisted receipt; it does not decide whether a repair passed.

See [`docs/architecture.md`](docs/architecture.md) for the component map,
workflow states, evidence topology, and model/human/test boundaries.

## Supported platforms

The Node.js and Playwright judge path supports Windows, macOS, and Linux with
Node.js 24.18.0 or newer and Playwright Chromium. CI uses Linux and installs
Chromium with its system dependencies. Media-production helpers ending in
`.ps1` require PowerShell and are not part of the judge path.

The scanner intentionally uses a fixed `1672 x 941` Chromium viewport, English
locale, device scale factor `1`, and reduced motion. Firefox, WebKit, remote
sites, authenticated sites, and production payment systems are outside the
demonstrated scope.

## Limitations

AccessPatch EU produces technical remediation evidence, not legal advice, certification, or a guarantee of EAA/WCAG compliance. AI-proposed patches require human review.

This repository demonstrates three curated fixture blockers on one synthetic
localhost checkout. A passing receipt is evidence for that bounded run, source
diff, and keyboard journey; it is not a general accessibility audit or a claim
that every user need has been tested.

## Security and privacy

The scanner permits only unauthenticated loopback HTTP(S), loopback
WebSockets, and browser-internal artifact URLs. It blocks service workers,
fails the scan when an external request is observed, and removes form values
before writing DOM and element evidence. Read [`SECURITY.md`](SECURITY.md)
before adapting the workflow.

## License and notices

The project source is available under the [MIT License](LICENSE). Third-party
package licenses and generated-asset provenance are recorded in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and
[`assets/ASSET_LEDGER.md`](assets/ASSET_LEDGER.md).
