# AccessPatch EU Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and fully verify an API-keyless Codex plugin that diagnoses,
repairs, and replays three blocking accessibility failures in a synthetic React
checkout, then package a complete OpenAI Build Week submission and
sub-three-minute demo video.

**Architecture:** One Vite/React application serves the synthetic checkout at
`/checkout` and the evidence dashboard at `/accesspatch`. A TypeScript CLI uses
Playwright and axe-core to write validated, atomic run manifests under
`public/runs`; a repo-scoped Codex plugin reads that evidence, asks for human
approval, patches only `src/checkout`, and verifies the same keyboard journey.

**Tech Stack:** Node.js 24.18.0, TypeScript 7.0.2, React 19.2.7, Vite 8.1.5,
Playwright 1.61.1, axe-core 4.12.1, Vitest 4.1.10, Zod 4.4.3, Codex CLI
0.142.2, PowerShell, ffmpeg 7.1.1.

## Global Constraints

- Every authored project file and generated artifact remains below
  `C:\Users\User\Desktop\hackathon`.
- The primary workflow uses the signed-in Codex client and requires no OpenAI
  Platform API key.
- GPT-5.6 usage is meaningful and documented in the repository, video, and
  Devpost copy.
- Browser targets are restricted to `localhost` and `127.0.0.1`.
- Codex may edit only `src/checkout` after explicit human approval.
- The demo uses synthetic data and makes no legal certification claim.
- The final video is English, 1920×1080, H.264/AAC, and shorter than 180
  seconds.
- External assets must be freely licensed and recorded in
  `assets/ASSET_LEDGER.md`; the preferred media plan uses only original UI,
  original SVG/CSS animation, and locally synthesized narration.
- Every implementation task follows red-green-refactor TDD and ends with an
  independently verifiable commit.

---

### Task 1: Bootstrap the single-app repository and validated run contracts

**Files:**
- Create: `.gitattributes`
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/contracts/run.ts`
- Create: `tools/accesspatch/paths.ts`
- Test: `tests/unit/run-contract.test.ts`
- Test: `tests/unit/paths.test.ts`

**Interfaces:**
- Produces: `RunManifestSchema`, `EvidenceSetSchema`, `VerificationSchema`,
  inferred TypeScript types, `PROJECT_ROOT`, and `assertInsideProject`.
- Consumes: no project code.

- [ ] **Step 1: Create the root package contract**

Use this exact root package shape:

```json
{
  "name": "accesspatch-eu",
  "version": "1.0.0",
  "private": true,
  "description": "Codex-native accessibility repair and verification loop",
  "license": "MIT",
  "type": "module",
  "engines": { "node": ">=24.18.0" },
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 4173",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1 --port 4173",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "accesspatch": "tsx tools/accesspatch/cli.ts",
    "scan:before": "npm run accesspatch -- scan --phase before",
    "scan:after": "npm run accesspatch -- scan --phase after",
    "verify": "npm run accesspatch -- verify",
    "reset:demo": "npm run accesspatch -- reset-demo",
    "judge": "node scripts/judge.mjs",
    "demo:verify": "node scripts/demo-verify.mjs",
    "submission:check": "npm run accesspatch -- submission-check"
  },
  "dependencies": {
    "@axe-core/playwright": "4.12.1",
    "@vitejs/plugin-react": "6.0.3",
    "axe-core": "4.12.1",
    "commander": "15.0.0",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "vite": "8.1.5",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@playwright/test": "1.61.1",
    "@types/node": "24.10.1",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "playwright": "1.61.1",
    "tsx": "4.23.1",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

Set `.gitattributes` to `* text=auto eol=lf`. Ignore dependency/build folders,
`public/runs/runtime`, `video/raw`, `video/work`, and local logs, while retaining
final submission files and sample evidence.

Configure Vitest to include only `tests/unit/**/*.test.ts`; configure
Playwright separately for `tests/e2e`. This prevents either runner from
collecting the other runner's test files.

- [ ] **Step 2: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { RunManifestSchema, VerificationSchema } from "../../src/contracts/run.js";

describe("RunManifestSchema", () => {
  it("rejects an awaiting-approval run without proposals", () => {
    expect(() =>
      RunManifestSchema.parse({
        schemaVersion: 1,
        runId: "run-20260720",
        status: "awaiting_approval",
        targetUrl: "http://127.0.0.1:4173/checkout",
        editableRoots: ["src/checkout"]
      }),
    ).toThrow();
  });
});

describe("VerificationSchema", () => {
  it("rejects a passed result with remaining findings", () => {
    expect(() =>
      VerificationSchema.parse({
        outcome: "passed",
        resolvedFindingIds: [],
        remainingFindingIds: ["AP-EU-001"],
        regressions: [],
        checkoutCompleted: true,
        diffPath: "runs/example/diff.patch"
      }),
    ).toThrow();
  });
});
```

```ts
import { expect, it } from "vitest";
import { assertInsideProject } from "../../tools/accesspatch/paths.js";

it("rejects a path outside the project root", () => {
  expect(() =>
    assertInsideProject("C:\\Users\\User\\Desktop\\outside\\report.json"),
  ).toThrow(/outside project root/i);
});
```

- [ ] **Step 3: Install and observe the expected import failures**

Run: `npm install`

Run: `npx vitest run tests/unit/run-contract.test.ts tests/unit/paths.test.ts`

Expected: FAIL because the imported modules do not exist.

- [ ] **Step 4: Implement Zod contracts and safe path resolution**

Define statuses `scanning`, `analyzing`, `awaiting_approval`, `patching`,
`verifying`, `passed`, and `failed`. Define stable finding IDs
`AP-EU-001` through `AP-EU-003`, evidence paths, journey checks, fix proposals,
human approval, and verification. Add refinements so state-specific fields are
required and passed verification cannot contain remaining findings or
regressions.

`assertInsideProject` resolves the candidate, compares case-insensitively on
Windows, and throws unless it equals the root or begins with
`PROJECT_ROOT + path.sep`.

- [ ] **Step 5: Run tests, typecheck, and commit**

Run: `npx vitest run tests/unit/run-contract.test.ts tests/unit/paths.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit code 0.

Commit:

```text
git add .
git commit -m "feat: define AccessPatch run contracts"
```

### Task 2: Build the synthetic checkout and fixed/broken fixtures

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/checkout/CheckoutPage.tsx`
- Create: `src/checkout/checkout.css`
- Create: `fixtures/broken-demo/CheckoutPage.tsx`
- Create: `fixtures/repaired-demo/CheckoutPage.tsx`
- Create: `fixtures/FIXTURE_MANIFEST.md`
- Create: `playwright.config.ts`
- Test: `tests/e2e/checkout-fixtures.spec.ts`

**Interfaces:**
- Produces: `/checkout`, stable `data-testid` selectors, synthetic order state,
  broken fixture, and repaired fixture.
- Consumes: React/Vite bootstrap from Task 1.

- [ ] **Step 1: Write the failing fixture tests**

The baseline test records defects as expected evidence:

```ts
test("broken fixture exposes the three curated blockers", async ({ page }) => {
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Start secure checkout" }).press("Enter");
  const focusTargets: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
    focusTargets.push(
      await page.evaluate(
        () => document.activeElement?.getAttribute("data-testid") ?? "",
      ),
    );
  }
  expect(new Set(focusTargets).size).toBe(1);
  await expect(page.locator('[data-testid="payment-submit"]'))
    .not.toHaveAccessibleName();
  await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.locator('[data-testid="form-error"]'))
    .not.toHaveAttribute("role", "alert");
});
```

The repaired-fixture test uses a repository-local temporary copy, restores the
checked-in source in `finally`, and asserts that Tab/Enter reaches
`data-testid="order-confirmation"`. Configure this describe block as serial so
source-fixture swaps cannot race.

- [ ] **Step 2: Run and observe the missing application**

Run: `npx playwright test tests/e2e/checkout-fixtures.spec.ts`

Expected: FAIL because `/checkout` is unavailable.

- [ ] **Step 3: Implement the polished broken checkout**

Use only synthetic name, address, and order data. Include:

- an English order summary;
- visible keyboard-key overlay;
- a checkout dialog that traps repeated Tab on the first field;
- an icon-only payment control without an accessible name;
- visible validation text without live-region semantics;
- stable test IDs;
- source markers `ACCESSPATCH-DEMO-001` through `003`; and
- zero external network calls or real payment controls.

- [ ] **Step 4: Implement the repaired fixture**

The fixed fixture changes only evidence-backed behavior:

```tsx
<section
  className="checkout-dialog"
  role="dialog"
  aria-modal="true"
  aria-labelledby="checkout-title"
>
  <h2 id="checkout-title">Complete your order</h2>
  <input
    ref={emailRef}
    id="email"
    data-testid="email"
    aria-invalid={Boolean(error)}
    aria-describedby={error ? "form-error" : undefined}
  />
  <button
    type="submit"
    data-testid="payment-submit"
    aria-label="Confirm and pay €42.00"
  >
    <CardIcon aria-hidden="true" />
  </button>
  {error && (
    <p id="form-error" data-testid="form-error" role="alert" aria-live="assertive">
      Enter a valid email address before continuing.
    </p>
  )}
</section>
```

Do not intercept Tab. On invalid submission focus the email field; on valid
keyboard submission render the confirmation state.

- [ ] **Step 5: Run browser tests, build, and commit**

Run: `npx playwright install chromium`

Run: `npx playwright test tests/e2e/checkout-fixtures.spec.ts`

Expected: baseline-evidence and repaired-journey tests pass.

Run: `npm run build`

Expected: Vite production build succeeds.

Commit:

```text
git add .
git commit -m "feat: add reproducible blocked checkout"
```

### Task 3: Implement atomic run storage and the evidence scanner

**Files:**
- Create: `accesspatch.config.json`
- Create: `tools/accesspatch/config.ts`
- Create: `tools/accesspatch/run-store.ts`
- Create: `tools/accesspatch/findings.ts`
- Create: `tools/accesspatch/keyboard-journey.ts`
- Create: `tools/accesspatch/scanner.ts`
- Test: `tests/unit/run-store.test.ts`
- Test: `tests/unit/findings.test.ts`
- Test: `tests/e2e/scanner.spec.ts`

**Interfaces:**
- Consumes: run contracts, checkout selectors, and localhost server.
- Produces: `RunStore`, `buildFindings`, `runKeyboardJourney`, and
  `scan(phase)`.

- [ ] **Step 1: Write failing atomic-store and stable-finding tests**

```ts
it("never exposes the temporary manifest as current.json", async () => {
  const store = new RunStore(testRoot);
  await store.write(validManifest);
  expect(await readJson("public/runs/current.json")).toEqual(validManifest);
  expect(await exists("public/runs/current.json.tmp")).toBe(false);
});
```

```ts
it("maps evidence to the stable three IDs", () => {
  const findings = buildFindings({
    axeButtonUnnamed: true,
    repeatedFocusTargets: ["email", "email", "email", "email", "email"],
    visibleErrorIsLive: false
  });
  expect(findings.map(({ id }) => id)).toEqual([
    "AP-EU-001",
    "AP-EU-002",
    "AP-EU-003"
  ]);
});
```

- [ ] **Step 2: Run and observe missing modules**

Run:
`npx vitest run tests/unit/run-store.test.ts tests/unit/findings.test.ts`

Expected: FAIL because the implementations are unavailable.

- [ ] **Step 3: Implement atomic run storage and finding normalization**

Write each manifest to a same-directory temporary file, fsync/close, then
rename to `current.json`. Resolve every path through `assertInsideProject`.
Map:

- unnamed payment control → `AP-EU-001`;
- repeated focus trap → `AP-EU-002`; and
- silent validation message → `AP-EU-003`.

Each finding contains source marker, user impact, selector, HTML excerpt, WCAG
tags, evidence paths, remediation constraint, and verification assertion.

- [ ] **Step 4: Write the failing scanner E2E test**

Assert:

```ts
expect(manifest.status).toBe("analyzing");
expect(manifest.before?.findings.map(({ id }) => id)).toEqual([
  "AP-EU-001",
  "AP-EU-002",
  "AP-EU-003"
]);
expect(manifest.before?.journeyChecks.some((check) => !check.passed)).toBe(true);
```

- [ ] **Step 5: Implement the scanner**

Use `@axe-core/playwright`, a fixed viewport, screenshots, Playwright trace,
DOM snapshot, ARIA snapshot, keyboard trace, and a synthetic form submission
used only to inspect announcement semantics. Reject non-localhost URLs.
Validate every manifest before atomic write. A baseline scan ends in
`analyzing`; the later `proposals write` command records Codex's evidence-backed
proposals and transitions the run to `awaiting_approval`.

- [ ] **Step 6: Run scanner tests and commit**

Run:
`npx vitest run tests/unit/run-store.test.ts tests/unit/findings.test.ts`

Run: `npx playwright test tests/e2e/scanner.spec.ts`

Expected: all pass and baseline evidence contains the exact three stable IDs.

Commit:

```text
git add .
git commit -m "feat: capture atomic accessibility evidence"
```

### Task 4: Add proposals, approval, allowlist enforcement, and verification

**Files:**
- Create: `tools/accesspatch/proposals.ts`
- Create: `tools/accesspatch/approval.ts`
- Create: `tools/accesspatch/git-guard.ts`
- Create: `tools/accesspatch/verifier.ts`
- Create: `tools/accesspatch/reset.ts`
- Test: `tests/unit/workflow-state.test.ts`
- Test: `tests/unit/git-guard.test.ts`
- Test: `tests/unit/verifier.test.ts`
- Test: `tests/unit/reset.test.ts`

**Interfaces:**
- Consumes: validated run manifest and Git diff.
- Produces: proposal and approval recording, source allowlist validation,
  `verify(before, after)`, and deterministic reset.

- [ ] **Step 1: Write failing state and allowlist tests**

Cover:

- proposals are required before awaiting approval;
- approval actor is always human;
- patching cannot begin after rejection;
- dirty editable source blocks a new run;
- changed files outside `src/checkout` fail verification; and
- scanner/tests/plugin/report changes are never accepted as product patches.

- [ ] **Step 2: Write failing verification tests**

The success case must equal:

```ts
expect(result).toMatchObject({
  outcome: "passed",
  resolvedFindingIds: ["AP-EU-001", "AP-EU-002", "AP-EU-003"],
  remainingFindingIds: [],
  regressions: [],
  checkoutCompleted: true
});
```

Also cover unresolved findings, a new serious/critical axe finding, incomplete
checkout, and mismatched run IDs.

- [ ] **Step 3: Run and observe failures**

Run:
`npx vitest run tests/unit/workflow-state.test.ts tests/unit/git-guard.test.ts tests/unit/verifier.test.ts tests/unit/reset.test.ts`

Expected: FAIL because implementations are unavailable.

- [ ] **Step 4: Implement fail-closed workflow helpers**

Use `spawn` with argument arrays and `shell: false` for Git. Normalize
repository-relative paths before allowlist comparison. Reset copies only
`fixtures/broken-demo/CheckoutPage.tsx` to
`src/checkout/CheckoutPage.tsx`; it never uses a destructive Git command.

- [ ] **Step 5: Run tests and commit**

Run:
`npx vitest run tests/unit/workflow-state.test.ts tests/unit/git-guard.test.ts tests/unit/verifier.test.ts tests/unit/reset.test.ts`

Expected: PASS.

Commit:

```text
git add .
git commit -m "feat: guard and verify approved repairs"
```

### Task 5: Build the complete CLI and deterministic judge workflow

**Files:**
- Create: `tools/accesspatch/cli.ts`
- Create: `scripts/start-server.mjs`
- Create: `scripts/demo-verify.mjs`
- Create: `scripts/judge.mjs`
- Test: `tests/unit/cli-contract.test.ts`
- Test: `tests/e2e/demo-workflow.spec.ts`

**Interfaces:**
- Consumes: scanner, store, workflow helpers, fixtures.
- Produces: all documented CLI commands plus `npm run judge` and
  `npm run demo:verify`.

- [ ] **Step 1: Write failing CLI contract tests**

Assert every command supports `--help`, successful commands print JSON, invalid
state returns non-zero, and errors go to stderr:

```ts
for (const args of [
  ["scan", "--help"],
  ["proposals", "write", "--help"],
  ["approval", "record", "--help"],
  ["verify", "--help"],
  ["reset-demo", "--help"],
  ["submission-check", "--help"]
]) {
  const result = await runCli(args);
  expect(result.exitCode).toBe(0);
}
```

- [ ] **Step 2: Run and observe the missing CLI failure**

Run: `npx vitest run tests/unit/cli-contract.test.ts`

Expected: FAIL because the CLI is unavailable.

- [ ] **Step 3: Implement Commander commands**

All commands load `accesspatch.config.json`, verify the project root, validate
state transitions, and never swallow an exception:

```ts
main(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Write and implement the deterministic demo test**

`demo-verify.mjs`:

1. resets the broken fixture;
2. starts Vite;
3. scans before;
4. records deterministic test proposals and approval;
5. copies the repaired fixture as a test-only stand-in for the approved Codex
   patch;
6. scans after;
7. verifies;
8. restores the broken fixture in `finally`; and
9. terminates Vite.

The real plugin flow uses Codex for step 5.

- [ ] **Step 5: Run workflow gates and commit**

Run: `npm run demo:verify`

Expected: output ends with `AccessPatch verification: PASS`.

Run: `npm run judge`

Expected: prints the dashboard URL, expected result, and no-login instructions.

Commit:

```text
git add .
git commit -m "feat: add reproducible AccessPatch CLI workflow"
```

### Task 6: Build the accessible evidence dashboard

**Files:**
- Create: `src/dashboard/DashboardPage.tsx`
- Create: `src/dashboard/useCurrentRun.ts`
- Create: `src/dashboard/dashboard.css`
- Modify: `src/App.tsx`
- Test: `tests/unit/dashboard-model.test.ts`
- Test: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `public/runs/current.json` and relative evidence artifacts.
- Produces: accessible `/accesspatch` states from scanning through passed or
  failed.

- [ ] **Step 1: Write failing dashboard-model tests**

Test scanning, awaiting approval, rejected, patching, verifying, passed, failed,
missing-manifest, and corrupt-manifest view models. Missing or corrupt data must
produce an explicit error and never invented metrics.

- [ ] **Step 2: Run and observe the missing dashboard failure**

Run: `npx vitest run tests/unit/dashboard-model.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement the dashboard**

Render:

- product statement and Developer Tools badge;
- journey timeline;
- before/after status;
- finding cards;
- screenshots, DOM/ARIA evidence, and keyboard trace;
- source markers and human-approved proposals;
- patch diff;
- verification assertions and tool versions; and
- “technical evidence, not certification” disclaimer.

Use semantic HTML, visible focus, AA contrast, reduced-motion support, and
original CSS/SVG only.

- [ ] **Step 4: Write and run browser accessibility tests**

Verify every run state, keyboard traversal, error rendering, and zero
critical/serious axe finding in the dashboard.

Run: `npx playwright test tests/e2e/dashboard.spec.ts`

Expected: PASS.

- [ ] **Step 5: Build and commit**

Run: `npm run build`

Expected: Vite build succeeds.

Commit:

```text
git add .
git commit -m "feat: visualize verified accessibility repairs"
```

### Task 7: Package and smoke-test the Codex plugin

**Files:**
- Create: `plugins/accesspatch-eu/.codex-plugin/plugin.json`
- Create: `plugins/accesspatch-eu/skills/accesspatch/SKILL.md`
- Create: `plugins/accesspatch-eu/README.md`
- Create: `.agents/plugins/marketplace.json`
- Test: `tests/unit/plugin-contract.test.ts`

**Interfaces:**
- Consumes: root CLI commands and editable-root policy.
- Produces: installable `$accesspatch-eu:accesspatch` workflow.

- [ ] **Step 1: Write failing plugin contract tests**

Assert manifest identity, skill discovery, every named CLI command, localhost
restriction, dirty-tree precondition, editable-root limit, proposal recording,
explicit approval sentence, after scan, verification, and truthful failure
reporting.

- [ ] **Step 2: Run and observe missing plugin files**

Run: `npx vitest run tests/unit/plugin-contract.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement the plugin and skill**

Manifest:

```json
{
  "name": "accesspatch-eu",
  "version": "1.0.0",
  "description": "Diagnose, approve, patch, and verify blocking accessibility defects.",
  "skills": "./skills/"
}
```

The skill must state exactly:

```text
Do not edit source before explicit approval.
```

It must inspect real evidence, record proposals, wait for approval, edit only
`src/checkout`, reject out-of-allowlist diffs, verify, and cite the exact test
commands and outcomes. It never reads Codex credential files or requests an API
key.

- [ ] **Step 4: Validate marketplace and install locally**

Run: `codex plugin marketplace add .`

Run: `codex plugin marketplace list`

Expected: the marketplace resolves to this repository. Install through the
Codex desktop Plugins directory, restart/refresh as required, and verify the
skill appears in a new task.

- [ ] **Step 5: Run contract tests and commit**

Run: `npx vitest run tests/unit/plugin-contract.test.ts`

Expected: PASS.

Commit:

```text
git add .
git commit -m "feat: package AccessPatch as a Codex plugin"
```

### Task 8: Add complete judge documentation, CI, and submission copy

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Create: `docs/architecture.md`
- Create: `docs/testing.md`
- Create: `docs/CODEX_COLLABORATION.md`
- Create: `SECURITY.md`
- Create: `LICENSE`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `assets/ASSET_LEDGER.md`
- Create: `submission/DEVPOST.md`
- Create: `submission/DEMO_SCRIPT.md`
- Create: `submission/DEMO_TRANSCRIPT.md`
- Create: `submission/DEMO_CAPTIONS.srt`
- Create: `submission/SUBMISSION_CHECKLIST.md`
- Create: `submission/TEST_CREDENTIALS.md`
- Create: `tools/accesspatch/submission-check.ts`
- Create: `scripts/secret-scan.mjs`
- Test: `tests/unit/docs-contract.test.ts`
- Test: `tests/unit/submission-check.test.ts`

**Interfaces:**
- Consumes: implemented commands and actual project facts.
- Produces: clean-clone instructions, Build Week evidence, final Devpost text,
  and machine-verifiable submission requirements.

- [ ] **Step 1: Write failing documentation and submission tests**

Require:

- README one-line value, judge quick start, architecture, supported platforms,
  exact commands, expected result, limitations, synthetic data, license, and
  Codex/GPT-5.6 explanation;
- a collaboration table with timestamp, task, files/commit, human decision, and
  verification;
- no-login/no-key judge path;
- final English Devpost sections;
- voiceover, captions, and transcript;
- feedback session field;
- no secret-like strings; and
- no unfinished-copy markers.

- [ ] **Step 2: Run and observe missing documentation**

Run:
`npx vitest run tests/unit/docs-contract.test.ts tests/unit/submission-check.test.ts`

Expected: FAIL with sorted missing-artifact messages.

- [ ] **Step 3: Write final documentation and copy**

Use this claim exactly:

```text
All three known critical fixture blockers were resolved, no new critical axe
finding appeared, and the scripted keyboard checkout completed.
```

Use this limitation exactly:

```text
AccessPatch EU produces technical remediation evidence, not legal advice,
certification, or a guarantee of EAA/WCAG compliance. AI-proposed patches
require human review.
```

Explain that GPT-5.6 correlates bounded browser evidence with source while
deterministic tests decide pass/fail. State clearly what Codex built and what
the human chose.

- [ ] **Step 4: Implement secret and submission validators**

Use ffprobe JSON for video duration/codecs/resolution/audio, image metadata for
screenshots, text scans for unfinished copy and secrets, and an asset-ledger
coverage check. External publish URLs may remain absent until the explicit
account handoff; every local artifact must otherwise pass.

- [ ] **Step 5: Add CI and run all non-media gates**

CI runs install, typecheck, unit tests, production build, and Playwright tests.

Run:

```text
node scripts/secret-scan.mjs
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Expected: all succeed.

- [ ] **Step 6: Commit**

```text
git add .
git commit -m "docs: prepare complete Build Week submission"
```

### Task 9: Produce screenshots, genuine demo footage, narration, and final MP4

**Files:**
- Create: `scripts/capture-demo.mjs`
- Create: `scripts/record-workflow.ps1`
- Create: `scripts/synthesize-narration.ps1`
- Create: `scripts/render-video.ps1`
- Create: `scripts/verify-video.ps1`
- Create: `video/scenes.json`
- Create: `video/captions.ass`
- Create: `video/README.md`
- Generate: `submission/screenshots/01-blocked-keyboard-checkout.png`
- Generate: `submission/screenshots/02-evidence-pack.png`
- Generate: `submission/screenshots/03-approved-source-diff.png`
- Generate: `submission/screenshots/04-verified-before-after.png`
- Generate: `submission/accesspatch-eu-thumbnail.png`
- Generate: `submission/accesspatch-eu-demo.mp4`
- Test: `tests/e2e/media-contract.spec.ts`

**Interfaces:**
- Consumes: final working app, actual AccessPatch run, English transcript,
  local system voice, and ffmpeg.
- Produces: public-ready video, transcript, captions, thumbnail, and screenshots.

- [ ] **Step 1: Write failing media contract tests**

Require:

- four screenshots at 1920×1080;
- thumbnail at 3840×2160 plus 1280×720 fallback;
- final video at 1920×1080, 30 fps, yuv420p, H.264, AAC stereo;
- duration from 150 through 175 seconds;
- non-zero English audio duration;
- captions and transcript; and
- no third-party logo or account-chrome marker in scene metadata.

- [ ] **Step 2: Capture deterministic project footage**

Use Playwright with fixed viewport, English locale, synthetic inputs, visible
Tab/Enter overlay, and all non-localhost requests blocked. Capture the blocked
journey, evidence pack, approved diff, successful replay, and verification.
Actual project output plus narration is sufficient evidence; do not include
account chrome or unauthorized trademarks.

- [ ] **Step 3: Record the genuine Codex-assisted workflow evidence**

Run the installed skill in a new GPT-5.6 Codex task. Save genuine textual output,
proposal JSON, approval record, Git diff, commit timestamps, and resulting
reports. If screen footage is used, crop it to project content and exclude
notifications, credentials, account identity, and product logos.

- [ ] **Step 4: Generate English narration and captions**

Use `System.Speech.Synthesis.SpeechSynthesizer` with an installed English voice
to create PCM WAV narration. Stop with a clear error if no English voice exists.
Target 2:50, normalize to approximately -16 LUFS, and keep captions text
identical to narration apart from timing line breaks.

- [ ] **Step 5: Render original motion graphics and final encode**

Create title, keyboard, evidence, and verification overlays with original
HTML/CSS/SVG. Use ffmpeg to normalize scenes, add captions, mix narration, and
encode H.264 High profile plus AAC with `+faststart`. No downloaded asset enters
the render unless its source and license appear in the asset ledger.

- [ ] **Step 6: Verify media and commit**

Run: `npx playwright test tests/e2e/media-contract.spec.ts`

Run:
`powershell -ExecutionPolicy Bypass -File scripts/verify-video.ps1`

Expected: all codec, resolution, sound, caption, asset, and duration checks pass.

Commit:

```text
git add .
git commit -m "feat: add final Build Week demo media"
```

### Task 10: Clean-checkout audit, plugin smoke test, and external handoff

**Files:**
- Generate: `submission/FINAL_VERIFICATION.json`
- Generate: `submission/FINAL_VERIFICATION.md`
- Modify only files implicated by a concrete failed verification.

**Interfaces:**
- Consumes: the complete repository and actual plugin run.
- Produces: final readiness evidence and a clean Git commit.

- [ ] **Step 1: Verify path and repository hygiene**

Assert every authored/generated project path is below the project root. Review
tracked large files, ignored raw media, secret scan, `git diff --check`, and
`git status --short`.

- [ ] **Step 2: Run clean-install gates**

Run in order:

```text
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run demo:verify
npm run submission:check
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Smoke-test the installed plugin**

In a new Codex task:

1. invoke AccessPatch with GPT-5.6;
2. scan the broken checkout;
3. inspect three real findings;
4. approve the constrained patch;
5. verify the repaired keyboard journey;
6. inspect the dashboard and diff; and
7. obtain the required `/feedback` Session ID.

Insert the actual ID into submission copy and rerun validation.

- [ ] **Step 4: Watch and audit the entire video**

Confirm sound, English narration, captions, final UI, actual verified output,
no blank frames, no secrets, no account chrome, and a judge-understandable story
without consulting the README.

- [ ] **Step 5: Generate final receipts and commit**

Record versions, commands, exit codes, test counts, hashes, media metadata,
plugin result, feedback session ID, commit SHA, and only the remaining external
account actions.

Commit:

```text
git add .
git commit -m "chore: finalize OpenAI Build Week submission"
git status --short --branch
```

Expected: clean `main`.

- [ ] **Step 6: Perform external account actions with the user**

Using the user's authenticated accounts and explicit publishing confirmation:

1. create/select the GitHub repository and push `main`;
2. publish a no-login judge build;
3. upload the final MP4 to YouTube as **Public**;
4. apply thumbnail and English captions;
5. wait for HD processing and copyright checks;
6. verify repository, demo, and video while signed out;
7. paste final URLs and Session ID into Devpost; and
8. submit and re-open the final entry before the official deadline.

All local files are complete before these external state changes.
