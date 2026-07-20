import { describe, expect, it } from "vitest";
import {
  FindingSchema,
  RunManifestSchema,
  VerificationSchema,
  type Finding,
} from "../../src/contracts/run.js";

const RUN_ID = "run-20260720-120000";
const RUNTIME_ROOT = `public/runs/runtime/${RUN_ID}`;
const timestamp = "2026-07-20T12:00:00.000Z";

const findingById: Record<string, Finding> = {
  "AP-EU-001": {
    id: "AP-EU-001",
    severity: "critical",
    rule: "button-name",
    sourceMarker: "ACCESSPATCH-DEMO-001",
    userImpact: "The payment action has no accessible name.",
    route: "/checkout",
    journeyStep: "Submit payment",
    selector: '[data-testid="payment-submit"]',
    htmlExcerpt: '<button data-testid="payment-submit"><svg /></button>',
    wcagTags: ["wcag2a", "wcag412"],
    evidencePaths: [`${RUNTIME_ROOT}/before/axe.json`],
    remediationConstraint: "Keep the existing payment action and add a stable accessible name.",
    verificationAssertion: 'Payment action has accessible name "Confirm and pay €42.00".',
  },
  "AP-EU-002": {
    id: "AP-EU-002",
    severity: "critical",
    rule: "keyboard-focus-trap",
    sourceMarker: "ACCESSPATCH-DEMO-002",
    userImpact: "Keyboard users cannot move beyond the email field.",
    route: "/checkout",
    journeyStep: "Move from email to payment",
    selector: '[data-testid="email"]',
    htmlExcerpt: '<input data-testid="email" />',
    wcagTags: ["wcag211", "wcag212", "wcag2a"],
    evidencePaths: [`${RUNTIME_ROOT}/before/keyboard.json`],
    remediationConstraint: "Preserve native Tab order without adding a positive tabindex.",
    verificationAssertion: "Tab moves focus from email to the payment action.",
  },
  "AP-EU-003": {
    id: "AP-EU-003",
    severity: "serious",
    rule: "validation-announcement",
    sourceMarker: "ACCESSPATCH-DEMO-003",
    userImpact: "The visible validation error is not announced.",
    route: "/checkout",
    journeyStep: "Submit invalid email",
    selector: '[data-testid="form-error"]',
    htmlExcerpt: '<p data-testid="form-error">Enter a valid email address.</p>',
    wcagTags: ["wcag2a", "wcag331", "wcag413"],
    evidencePaths: [`${RUNTIME_ROOT}/before/aria.yml`],
    remediationConstraint: "Announce the existing useful message and return focus to email.",
    verificationAssertion: "Invalid submission exposes an assertive alert and focuses email.",
  },
};

function evidence(phase: "before" | "after", findings = Object.values(findingById)) {
  const root = `${RUNTIME_ROOT}/${phase}`;
  const phaseFindings = findings.map((finding) => ({
    ...finding,
    evidencePaths: finding.evidencePaths.map((evidencePath) =>
      evidencePath.replace(`${RUNTIME_ROOT}/before/`, `${RUNTIME_ROOT}/${phase}/`),
    ),
  }));
  return {
    runId: RUN_ID,
    phase,
    url: "http://127.0.0.1:4173/checkout",
    capturedAt: timestamp,
    screenshotPath: `${root}/screenshot.png`,
    tracePath: `${root}/trace.zip`,
    domPath: `${root}/dom.html`,
    ariaSnapshotPath: `${root}/aria.yml`,
    axeReportPath: `${root}/axe.json`,
    keyboardTracePath: `${root}/keyboard.json`,
    findings: phaseFindings,
    journeyChecks: [
      {
        id: "checkout-completes",
        label: "Keyboard journey reaches order confirmation",
        passed: false,
        evidencePath: `${root}/keyboard.json`,
      },
    ],
  };
}

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    revision: 0,
    runId: RUN_ID,
    runMode: "interactive",
    status: "scanning",
    targetUrl: "http://127.0.0.1:4173/checkout",
    editableRoots: ["src/checkout"],
    baselineCommit: "a".repeat(40),
    createdAt: timestamp,
    updatedAt: timestamp,
    toolVersions: {
      node: "24.18.0",
      playwright: "1.61.1",
      axe: "4.12.1",
      accesspatch: "1.0.0",
    },
    ...overrides,
  };
}

const proposals = Object.values(findingById).map((finding) => ({
  findingId: finding.id,
  diagnosis: `Diagnosis for ${finding.id}`,
  proposedChange: `Repair ${finding.id}`,
  candidateFiles: ["src/checkout/CheckoutPage.tsx"],
}));

const approval = {
  decision: "approved" as const,
  findingIds: ["AP-EU-001", "AP-EU-002", "AP-EU-003"] as const,
  actor: "human" as const,
  recordedAt: timestamp,
};

describe("RunManifestSchema", () => {
  it("accepts the complete persisted before/after topology and rejects aliases", () => {
    const parsed = RunManifestSchema.parse(manifest({ status: "analyzing", before: evidence("before") }));
    expect(parsed.before?.axeReportPath).toBe(`${RUNTIME_ROOT}/before/axe.json`);
    expect(() => RunManifestSchema.parse({ ...parsed, evidence: { before: [], after: [] } })).toThrow();
    expect(() => FindingSchema.parse({ ...findingById["AP-EU-001"], lineNumber: 81 })).toThrow();
  });

  it.each([
    "https://example.com/checkout",
    "http://127.0.0.1.evil.example/checkout",
    "http://user:secret@127.0.0.1:4173/checkout",
    "ftp://127.0.0.1/checkout",
  ])("rejects a non-local or unsafe target URL: %s", (targetUrl) => {
    expect(() => RunManifestSchema.parse(manifest({ targetUrl }))).toThrow();
  });

  it.each([
    { editableRoots: ["src"] },
    { editableRoots: ["src/checkout", "src/other"] },
    { editableRoots: ["src/checkout/"] },
  ])(
    "rejects editable roots other than the exact checkout root",
    ({ editableRoots }) => {
      expect(() => RunManifestSchema.parse(manifest({ editableRoots }))).toThrow();
    },
  );

  it("requires matching run IDs and run-scoped POSIX artifact paths", () => {
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "analyzing",
          before: { ...evidence("before"), runId: "another-run" },
        }),
      ),
    ).toThrow(/run id/i);
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "analyzing",
          before: { ...evidence("before"), tracePath: "public/runs/runtime/other/trace.zip" },
        }),
      ),
    ).toThrow(/artifact/i);
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "analyzing",
          before: { ...evidence("before"), domPath: `${RUNTIME_ROOT}\\before\\dom.html` },
        }),
      ),
    ).toThrow();
  });

  it("binds every evidence artifact to its declared phase", () => {
    const before = evidence("before");
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "analyzing",
          before: {
            ...before,
            screenshotPath: `${RUNTIME_ROOT}/after/screenshot.png`,
          },
        }),
      ),
    ).toThrow(/phase/i);
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "analyzing",
          before: {
            ...before,
            findings: [
              {
                ...before.findings[0],
                evidencePaths: [`${RUNTIME_ROOT}/after/axe.json`],
              },
              ...before.findings.slice(1),
            ],
          },
        }),
      ),
    ).toThrow(/phase/i);
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "analyzing",
          before: {
            ...before,
            journeyChecks: [
              {
                ...before.journeyChecks[0],
                evidencePath: `${RUNTIME_ROOT}/after/keyboard.json`,
              },
            ],
          },
        }),
      ),
    ).toThrow(/phase/i);
  });

  it("requires one sorted proposal for every baseline finding", () => {
    expect(() =>
      RunManifestSchema.parse(manifest({ status: "awaiting_approval", before: evidence("before") })),
    ).toThrow(/proposal/i);
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "awaiting_approval",
          before: evidence("before"),
          proposals: [proposals[0], proposals[0], proposals[2]],
        }),
      ),
    ).toThrow(/proposal/i);
    expect(
      RunManifestSchema.parse({
        ...manifest({
          status: "awaiting_approval",
          before: evidence("before"),
          proposals,
        }),
      }).status,
    ).toBe("awaiting_approval");
  });

  it("enforces actor-aware approved findings while patching", () => {
    expect(
      RunManifestSchema.parse(
        manifest({
          status: "patching",
          before: evidence("before"),
          proposals,
          approval,
        }),
      ).status,
    ).toBe("patching");
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "patching",
          before: evidence("before"),
          proposals,
          approval: { ...approval, actor: "test_fixture" },
        }),
      ),
    ).toThrow(/actor/i);
    expect(
      RunManifestSchema.parse(
        manifest({
          runMode: "deterministic_fixture",
          status: "patching",
          before: evidence("before"),
          proposals,
          approval: { ...approval, actor: "test_fixture" },
        }),
      ).runMode,
    ).toBe("deterministic_fixture");
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "analyzing",
          before: evidence("before"),
          approval: { ...approval, actor: "test_fixture" },
        }),
      ),
    ).toThrow(/actor/i);
  });

  it("requires before and after evidence before verifying", () => {
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "verifying",
          before: evidence("before"),
          proposals,
          approval,
        }),
      ),
    ).toThrow(/after/i);
    expect(
      RunManifestSchema.parse(
        manifest({
          status: "verifying",
          before: evidence("before"),
          after: evidence("after", []),
          proposals,
          approval,
        }),
      ).status,
    ).toBe("verifying");
  });

  it("requires a complete passed receipt for all stable findings", () => {
    const verification = {
      outcome: "passed" as const,
      resolvedFindingIds: ["AP-EU-001", "AP-EU-002", "AP-EU-003"],
      remainingFindingIds: [],
      regressions: [],
      checkoutCompleted: true,
      changedFiles: ["src/checkout/CheckoutPage.tsx"],
      diffWithinAllowlist: true,
      diffPath: `${RUNTIME_ROOT}/verification/diff.patch`,
      failureReasons: [],
    };
    const passed = manifest({
      status: "passed",
      before: evidence("before"),
      after: evidence("after", []),
      proposals,
      approval,
      verification,
    });

    expect(RunManifestSchema.parse(passed).status).toBe("passed");
    expect(() =>
      RunManifestSchema.parse({
        ...passed,
        verification: { ...verification, checkoutCompleted: false },
      }),
    ).toThrow();
    expect(() =>
      RunManifestSchema.parse({
        ...passed,
        verification: { ...verification, resolvedFindingIds: ["AP-EU-001", "AP-EU-002"] },
      }),
    ).toThrow();
  });

  it("rejects a false pass when after evidence still contains findings", () => {
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "passed",
          before: evidence("before"),
          after: evidence("after"),
          proposals,
          approval,
          verification: {
            outcome: "passed",
            resolvedFindingIds: ["AP-EU-001", "AP-EU-002", "AP-EU-003"],
            remainingFindingIds: [],
            regressions: [],
            checkoutCompleted: true,
            changedFiles: ["src/checkout/CheckoutPage.tsx"],
            diffWithinAllowlist: true,
            diffPath: `${RUNTIME_ROOT}/verification/diff.patch`,
            failureReasons: [],
          },
        }),
      ),
    ).toThrow(/after findings/i);
  });

  it("rejects a passed manifest carrying a workflow error", () => {
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "passed",
          before: evidence("before"),
          after: evidence("after", []),
          proposals,
          approval,
          verification: {
            outcome: "passed",
            resolvedFindingIds: ["AP-EU-001", "AP-EU-002", "AP-EU-003"],
            remainingFindingIds: [],
            regressions: [],
            checkoutCompleted: true,
            changedFiles: ["src/checkout/CheckoutPage.tsx"],
            diffWithinAllowlist: true,
            diffPath: `${RUNTIME_ROOT}/verification/diff.patch`,
            failureReasons: [],
          },
          error: {
            code: "CONTRADICTORY_ERROR",
            stage: "verifying",
            message: "This must not coexist with a pass.",
            occurredAt: timestamp,
            retryable: false,
          },
        }),
      ),
    ).toThrow(/error/i);
  });

  it("requires after findings to exactly match remaining findings and regressions", () => {
    const after = evidence("after", [
      findingById["AP-EU-001"],
      findingById["AP-EU-002"],
    ]);
    const regression = {
      ...findingById["AP-EU-003"],
      evidencePaths: [`${RUNTIME_ROOT}/after/axe.json`],
    };
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "failed",
          before: evidence("before"),
          after,
          verification: {
            outcome: "failed",
            resolvedFindingIds: ["AP-EU-002"],
            remainingFindingIds: ["AP-EU-001", "AP-EU-003"],
            regressions: [regression],
            checkoutCompleted: false,
            changedFiles: [],
            diffWithinAllowlist: true,
            diffPath: `${RUNTIME_ROOT}/verification/diff.patch`,
            failureReasons: ["A blocker remains."],
          },
        }),
      ),
    ).toThrow(/after findings/i);
  });

  it("rejects contradictory failed terminal routes", () => {
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "failed",
          before: evidence("before"),
          after: evidence("after"),
          verification: {
            outcome: "failed",
            resolvedFindingIds: [],
            remainingFindingIds: ["AP-EU-001", "AP-EU-002", "AP-EU-003"],
            regressions: [],
            checkoutCompleted: false,
            changedFiles: [],
            diffWithinAllowlist: true,
            diffPath: `${RUNTIME_ROOT}/verification/diff.patch`,
            failureReasons: ["Checkout remains blocked."],
          },
          error: {
            code: "ALSO_FAILED",
            stage: "verifying",
            message: "Only one terminal failure route is allowed.",
            occurredAt: timestamp,
            retryable: false,
          },
        }),
      ),
    ).toThrow(/exactly one/i);
  });

  it("scopes verification regression evidence to the manifest run", () => {
    const regression = {
      ...findingById["AP-EU-001"],
      evidencePaths: ["public/runs/runtime/another-run/after/axe.json"],
    };
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "failed",
          before: evidence("before"),
          verification: {
            outcome: "failed",
            resolvedFindingIds: [],
            remainingFindingIds: ["AP-EU-001", "AP-EU-002", "AP-EU-003"],
            regressions: [regression],
            checkoutCompleted: false,
            changedFiles: [],
            diffWithinAllowlist: true,
            diffPath: `${RUNTIME_ROOT}/verification/diff.patch`,
            failureReasons: ["A new blocker appeared."],
          },
        }),
      ),
    ).toThrow(/artifact/i);
  });

  it("requires regression evidence to use the same run after phase", () => {
    const regression = {
      ...findingById["AP-EU-001"],
      evidencePaths: [`${RUNTIME_ROOT}/before/axe.json`],
    };
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "failed",
          before: evidence("before"),
          after: evidence("after", [findingById["AP-EU-001"]]),
          verification: {
            outcome: "failed",
            resolvedFindingIds: ["AP-EU-002", "AP-EU-003"],
            remainingFindingIds: ["AP-EU-001"],
            regressions: [regression],
            checkoutCompleted: false,
            changedFiles: [],
            diffWithinAllowlist: true,
            diffPath: `${RUNTIME_ROOT}/verification/diff.patch`,
            failureReasons: ["A regression appeared."],
          },
        }),
      ),
    ).toThrow(/after phase/i);
  });

  it("accepts an honest pre-verification failed manifest with a structured error", () => {
    expect(
      RunManifestSchema.parse(
        manifest({
          status: "failed",
          error: {
            code: "BROWSER_LAUNCH_FAILED",
            stage: "scanning",
            message: "Chromium was unavailable.",
            occurredAt: timestamp,
            retryable: true,
          },
        }),
      ).status,
    ).toBe("failed");
  });

  it("requires failed verification reasons or a structured workflow error", () => {
    expect(() => RunManifestSchema.parse(manifest({ status: "failed" }))).toThrow();
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "failed",
          verification: {
            outcome: "failed",
            resolvedFindingIds: [],
            remainingFindingIds: [],
            regressions: [],
            checkoutCompleted: false,
            changedFiles: [],
            diffWithinAllowlist: true,
            diffPath: `${RUNTIME_ROOT}/verification/diff.patch`,
            failureReasons: [],
          },
        }),
      ),
    ).toThrow(/reason/i);
  });
});

describe("VerificationSchema", () => {
  it("rejects overlapping, duplicate, or unsorted finding identity arrays", () => {
    const base = {
      outcome: "failed" as const,
      resolvedFindingIds: ["AP-EU-002"],
      remainingFindingIds: ["AP-EU-001", "AP-EU-003"],
      regressions: [],
      checkoutCompleted: false,
      changedFiles: [],
      diffWithinAllowlist: true,
      diffPath: `${RUNTIME_ROOT}/verification/diff.patch`,
      failureReasons: ["Checkout did not complete."],
    };
    expect(VerificationSchema.parse(base).outcome).toBe("failed");
    expect(() =>
      VerificationSchema.parse({
        ...base,
        resolvedFindingIds: ["AP-EU-002", "AP-EU-001"],
      }),
    ).toThrow();
    expect(() =>
      VerificationSchema.parse({
        ...base,
        remainingFindingIds: ["AP-EU-001", "AP-EU-002"],
      }),
    ).toThrow();
  });
});
