# AccessPatch EU Design

## Product statement

AccessPatch EU is a Codex-native developer tool that turns a failed
keyboard-only checkout into an evidence-backed source patch and then proves
that the same journey succeeds.

The memorable demo loop is:

> blocked checkout → scan → approve → patch → verify

The project targets the OpenAI Build Week **Developer Tools** track. It uses
GPT-5.6 through Codex and does not require an OpenAI Platform API key for its
primary local workflow.

## User and problem

The primary user is a frontend developer or small product team responsible for
an e-commerce checkout.

Automated accessibility scanners are useful, but they usually stop at a list of
violations. Developers must still:

1. reproduce the user-facing failure,
2. connect runtime evidence to the responsible source,
3. decide on a safe repair,
4. apply the repair, and
5. rerun the exact journey to prove it works.

AccessPatch EU closes that loop inside Codex.

## Success criteria

The MVP is successful when a new judge can:

1. install dependencies with one documented command;
2. launch the deliberately broken demo checkout;
3. run the AccessPatch Codex skill;
4. see three reproducible accessibility blockers with evidence;
5. approve a source patch;
6. rerun the same keyboard-only journey;
7. see zero critical blockers and a completed checkout;
8. inspect the patch, before/after evidence, and verification receipt;
9. run all automated tests without undocumented setup; and
10. watch a public-ready English demo video shorter than three minutes.

## Scope

### Included

- A deliberately broken React checkout used only as synthetic demo data.
- A keyboard-only Playwright journey.
- axe-core automated checks.
- Three curated blocking patterns:
  - an unnamed checkout control,
  - a keyboard focus trap,
  - an error message that is not announced to assistive technology.
- Screenshot, DOM, accessibility, keyboard-trace, and source-hint evidence.
- A versioned JSON audit schema.
- A Codex plugin containing the `accesspatch` skill.
- A mandatory approval gate before source edits.
- Verification by replaying the exact same journey.
- An evidence dashboard with before/after comparison.
- Deterministic demo reset and golden repaired fixture.
- Unit, contract, integration, end-to-end, accessibility, packaging, and
  submission tests.
- A reproducible, English, sub-three-minute demo video.
- Devpost copy, screenshots, thumbnail, testing instructions, license, and
  asset provenance.

### Excluded

- Claims of legal compliance or formal EAA/WCAG certification.
- Auditing arbitrary public websites without their source code.
- Authentication, accounts, billing, teams, or cloud persistence.
- Automatic deployment of the patch.
- An OpenAI Platform API key.
- Sora, voice agents, a general multi-agent dashboard, or unrelated MCP
  integrations.
- Real customer, payment, disability, or personal data.

## Primary experience

### 1. Reproduce

The plugin starts the demo store and dashboard, then runs the keyboard journey.
The baseline journey must visibly fail before order confirmation.

### 2. Diagnose

The scanner produces a structured report containing:

- stable finding ID;
- severity;
- rule;
- user-visible impact;
- route and journey step;
- selector and source hint;
- screenshot path;
- DOM excerpt;
- keyboard trace;
- remediation constraint; and
- verification assertion.

The skill asks Codex to correlate those artifacts with the demo source and
prepare a concise repair plan.

### 3. Approve

Codex presents the exact files and intended behavioral changes. It must not
edit until the user explicitly approves.

### 4. Patch

Codex makes the smallest source change that addresses the evidence. The skill
restricts edits to the demo-store source, relevant tests, and generated report
artifacts.

### 5. Verify

The same Playwright journey and axe checks run again. A verification receipt
compares finding IDs and journey assertions. A result is successful only when:

- all three baseline critical findings are resolved;
- no new critical axe violation appears;
- keyboard focus can reach and activate checkout;
- invalid fields announce a useful message; and
- the order confirmation state is reached without mouse input.

### 6. Explain

The dashboard shows:

- the original blocked journey;
- the repaired journey;
- finding-by-finding status;
- the approved source diff;
- verification assertions;
- timestamps and tool versions; and
- a disclaimer that the result is technical evidence, not certification.

## Architecture

The repository uses one Vite + React + TypeScript application and one
TypeScript CLI. This keeps the demo, evidence viewer, and generated artifacts
on one localhost origin and removes the need for a second server, CORS,
WebSockets, a database, or an API key.

### `src/checkout`

The `/checkout` route is a polished synthetic storefront. The checked-in
default is intentionally broken. Separate broken and repaired fixtures exist
for deterministic reset and automated comparison.

### `src/dashboard`

The `/accesspatch` route is a read-only evidence viewer. It polls the atomic
`public/runs/current.json` manifest and renders every workflow state. It does
not perform model calls, claim to invoke AI, or edit source.

### `tools/accesspatch`

A Node 24 + TypeScript library and CLI owns:

- Playwright journey execution;
- axe-core injection;
- custom keyboard assertions;
- atomic audit/run-manifest writes;
- baseline/after comparison;
- safe editable-root enforcement;
- demo reset; and
- submission validation.

Its public state contract is:

```ts
type RunStatus =
  | "scanning"
  | "analyzing"
  | "awaiting_approval"
  | "patching"
  | "verifying"
  | "passed"
  | "failed";

interface EvidenceSet {
  phase: "before" | "after";
  url: string;
  capturedAt: string;
  screenshotPath: string;
  tracePath: string;
  domPath: string;
  ariaSnapshotPath: string;
  findings: Finding[];
  journeyChecks: JourneyCheck[];
}

interface FixProposal {
  findingId: string;
  diagnosis: string;
  proposedChange: string;
  candidateFiles: string[];
}

interface Approval {
  decision: "approved" | "rejected";
  findingIds: string[];
  actor: "human";
  recordedAt: string;
}

interface Verification {
  outcome: "passed" | "failed";
  resolvedFindingIds: string[];
  remainingFindingIds: string[];
  regressions: Finding[];
  checkoutCompleted: boolean;
  diffPath: string;
}

interface RunManifest {
  schemaVersion: 1;
  runId: string;
  status: RunStatus;
  targetUrl: string;
  editableRoots: string[];
  before?: EvidenceSet;
  proposals?: FixProposal[];
  approval?: Approval;
  after?: EvidenceSet;
  verification?: Verification;
}
```

The CLI commands are:

```text
accesspatch scan --phase before
accesspatch proposals write --input <json>
accesspatch approval record --finding AP-EU-001 --finding AP-EU-002
accesspatch scan --phase after
accesspatch verify
accesspatch reset-demo
accesspatch submission-check
```

Every manifest is validated with Zod and written through a temporary file plus
atomic rename so the dashboard never reads partial JSON. Browser URLs are
restricted to `localhost` and `127.0.0.1`. Source edits are allowed only below
`src/checkout`.

### `plugins/accesspatch-eu`

A valid Codex plugin with one `accesspatch` skill. The skill orchestrates the
CLI, reads evidence, records proposals, requests approval, edits source,
verifies, and explains the result. The plugin includes no credential and no
external connector.

The repository also includes a repo-scoped marketplace entry under
`.agents/plugins/marketplace.json` for local installation and judging.

## Repository layout

```text
C:\Users\User\Desktop\hackathon\
  .agents\plugins\marketplace.json
  .github\workflows\ci.yml
  assets\
    ASSET_LEDGER.md
  docs\
    architecture.md
    CODEX_COLLABORATION.md
    testing.md
    superpowers\
      plans\
      specs\
  fixtures\
    broken-demo\
    repaired-demo\
  plugins\
    accesspatch-eu\
      .codex-plugin\plugin.json
      skills\accesspatch\SKILL.md
  public\
    runs\
    samples\
  scripts\
    capture-demo.mjs
    render-video.ps1
    verify-video.ps1
  src\
    checkout\
    dashboard\
    App.tsx
    main.tsx
    styles.css
  tests\
    e2e\
    unit\
  tools\
    accesspatch\
      cli.ts
      config.ts
      findings.ts
      keyboard-journey.ts
      run-store.ts
      scanner.ts
      submission-check.ts
      verifier.ts
  submission\
    DEVPOST.md
    DEMO_SCRIPT.md
    SUBMISSION_CHECKLIST.md
    accesspatch-eu-demo.mp4
    accesspatch-eu-thumbnail.png
    screenshots\
  LICENSE
  README.md
  SECURITY.md
  THIRD_PARTY_NOTICES.md
  accesspatch.config.json
  index.html
  package.json
  package-lock.json
  tsconfig.json
  vite.config.ts
  vitest.config.ts
```

Generated intermediate video, browser, and audit files remain below this
repository and are ignored where appropriate. No project artifact is written
outside `C:\Users\User\Desktop\hackathon`.

## Error handling and safety

- The CLI fails with a non-zero exit code and a human-readable message when the
  demo server, browser, schema, report, or expected fixture is unavailable.
- A failed or partial audit never becomes a green verification receipt.
- Patch application requires an explicit user approval in Codex.
- The plugin never requests credentials or accesses real checkout data.
- Browser automation is restricted to the configured localhost origin.
- Generated paths are resolved and checked to remain inside the repository.
- The demo reset copies only the checked-in synthetic fixture; it does not use
  destructive Git reset commands.
- The dashboard displays incomplete and failed states rather than inventing
  results.
- Every downloaded asset must be free for the intended use and recorded in
  `assets/ASSET_LEDGER.md`. Original generated assets are recorded as such.

## Testing strategy

### Unit tests

- finding normalization and stable IDs;
- report schema validation;
- verification comparison;
- safe path enforcement; and
- submission manifest validation.

### Contract tests

- CLI exit codes and JSON output;
- plugin manifest shape;
- skill required sections and approval language; and
- deterministic reset behavior.

### Integration tests

- scanner against the broken fixture yields the three expected blockers;
- scanner against the golden repaired fixture yields no critical blocker;
- report publication produces dashboard-consumable files; and
- verification rejects missing, corrupt, or incomparable reports.

### End-to-end tests

- baseline keyboard journey fails at the expected step;
- repaired keyboard journey completes;
- dashboard renders both phases and the verification receipt;
- all links and controls are keyboard accessible; and
- production builds start from a clean checkout.

### Submission tests

- README and required submission documents exist;
- demo video exists, is H.264/AAC MP4, and is shorter than 180 seconds;
- thumbnail and required screenshots exist at the documented dimensions;
- no secret-like values are committed;
- asset ledger covers every non-code external asset;
- English demo script and captions exist;
- repository setup and test commands work; and
- no placeholder markers remain in submission files.

## Demo video

The final video is an English 16:9 MP4 shorter than three minutes.

The narrative is:

1. show a keyboard user blocked at checkout;
2. run AccessPatch inside Codex;
3. show evidence mapped to source;
4. show the approval gate;
5. apply the patch;
6. replay the same journey successfully;
7. show the verification receipt and source diff; and
8. explain how GPT-5.6 and Codex were used.

Browser footage is captured reproducibly with Playwright. Codex footage is an
actual recording of the workflow, not a fabricated model response. Editing,
captions, narration, audio normalization, and final encoding are performed
locally. Any music, sound, graphic, or animation is original or freely licensed
and entered in the asset ledger.

## Submission package

The repository must contain:

- a working project;
- a permissive license;
- setup, installation, testing, and judge instructions;
- a description of what was built during the submission window;
- a clear account of where Codex accelerated development and where human
  decisions were made;
- explicit evidence of GPT-5.6 usage;
- the main Codex `/feedback` session identifier or exact final retrieval step;
- a public-ready YouTube MP4, thumbnail, captions, and transcript;
- Devpost title, tagline, problem, solution, implementation, challenges,
  accomplishments, lessons, and next steps;
- screenshots;
- a no-login local testing path; and
- a final checklist distinguishing completed local artifacts from the external
  YouTube upload and Devpost submit actions.

## Acceptance criteria

The project is complete only when:

- `npm ci` succeeds in a clean repository;
- `npm test` passes;
- `npm run test:e2e` passes;
- `npm run build` passes;
- `npm run demo:verify` proves the before/after flow;
- `npm run submission:check` passes;
- the plugin installs from the repo marketplace and works in a new Codex task;
- the final MP4 passes codec, resolution, audio, and duration checks;
- all submission copy is final English text with no placeholders;
- the Git working tree contains no accidental or secret files; and
- all project files remain under `C:\Users\User\Desktop\hackathon`.
