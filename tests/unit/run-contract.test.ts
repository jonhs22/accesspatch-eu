import { describe, expect, it } from "vitest";
import { RunManifestSchema, VerificationSchema } from "../../src/contracts/run.js";

const proposal = {
  id: "proposal-1",
  findingIds: ["AP-EU-001"],
  summary: "Add an accessible label.",
  files: ["src/checkout/PaymentForm.tsx"],
};

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    runId: "run-20260720",
    status: "scanning",
    targetUrl: "http://127.0.0.1:4173/checkout",
    editableRoots: ["src/checkout"],
    ...overrides,
  };
}

describe("RunManifestSchema", () => {
  it("rejects an awaiting-approval run without proposals", () => {
    expect(() =>
      RunManifestSchema.parse({
        schemaVersion: 1,
        runId: "run-20260720",
        status: "awaiting_approval",
        targetUrl: "http://127.0.0.1:4173/checkout",
        editableRoots: ["src/checkout"],
      }),
    ).toThrow();
  });

  it.each([
    "https://example.com/checkout",
    "http://127.0.0.1.evil.example/checkout",
    "http://user:secret@127.0.0.1:4173/checkout",
    "ftp://127.0.0.1/checkout",
  ])("rejects a non-local or unsafe target URL: %s", (targetUrl) => {
    expect(() => RunManifestSchema.parse(manifest({ targetUrl }))).toThrow();
  });

  for (const editableRoots of [["src"], ["src/checkout", "src/other"], ["src/checkout/"]]) {
    it("rejects an editable-root list outside the sole checkout root", () => {
      expect(() => RunManifestSchema.parse(manifest({ editableRoots }))).toThrow();
    });
  }

  it("accepts every valid run state", () => {
    const approved = { decision: "approved", approvedProposalIds: [proposal.id] };
    const passedVerification = {
      outcome: "passed",
      resolvedFindingIds: ["AP-EU-001"],
      remainingFindingIds: [],
      regressions: [],
      checkoutCompleted: true,
      diffPath: "runs/example/diff.patch",
    };
    const failedVerification = { ...passedVerification, outcome: "failed" };

    expect(RunManifestSchema.parse(manifest({ status: "scanning" })).status).toBe("scanning");
    expect(RunManifestSchema.parse(manifest({ status: "analyzing" })).status).toBe("analyzing");
    expect(RunManifestSchema.parse(manifest({ status: "awaiting_approval", proposals: [proposal] })).status).toBe("awaiting_approval");
    expect(RunManifestSchema.parse(manifest({ status: "patching", proposals: [proposal], approval: approved })).status).toBe("patching");
    expect(RunManifestSchema.parse(manifest({ status: "verifying", proposals: [proposal], approval: approved })).status).toBe("verifying");
    expect(RunManifestSchema.parse(manifest({ status: "passed", verification: passedVerification })).status).toBe("passed");
    expect(RunManifestSchema.parse(manifest({ status: "failed", verification: failedVerification })).status).toBe("failed");
  });

  it.each([
    { decision: "approved", approvedProposalIds: [] },
    { decision: "approved", approvedProposalIds: ["missing-proposal"] },
    { decision: "rejected", approvedProposalIds: [] },
  ])("rejects invalid patching approval", (approval) => {
    expect(() => RunManifestSchema.parse(manifest({ status: "patching", proposals: [proposal], approval }))).toThrow();
  });

  it("rejects verifying after rejection", () => {
    expect(() =>
      RunManifestSchema.parse(
        manifest({
          status: "verifying",
          proposals: [proposal],
          approval: { decision: "rejected", approvedProposalIds: [] },
        }),
      ),
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
        diffPath: "runs/example/diff.patch",
      }),
    ).toThrow();
  });
});
