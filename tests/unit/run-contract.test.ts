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
        editableRoots: ["src/checkout"],
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
        diffPath: "runs/example/diff.patch",
      }),
    ).toThrow();
  });
});
