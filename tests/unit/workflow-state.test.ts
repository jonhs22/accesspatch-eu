import { describe, expect, it } from "vitest";
import { recordApproval } from "../../tools/accesspatch/approval.js";
import { writeProposals } from "../../tools/accesspatch/proposals.js";
import type { Finding, RunManifest } from "../../src/contracts/run.js";

const now = "2026-07-20T12:00:00.000Z";
const runId = "run-task-4";
const root = `public/runs/runtime/${runId}`;
const ids = ["AP-EU-001", "AP-EU-002", "AP-EU-003"] as const;

function finding(id: (typeof ids)[number]): Finding {
  return {
    id, severity: id === "AP-EU-003" ? "serious" : "critical", rule: `rule-${id}`,
    sourceMarker: `ACCESSPATCH-DEMO-${id.slice(-3)}`, userImpact: "Impact", route: "/checkout",
    journeyStep: "Checkout", selector: "button", htmlExcerpt: "<button />", wcagTags: ["wcag2a"],
    evidencePaths: [`${root}/before/${id}.json`], remediationConstraint: "Keep checkout", verificationAssertion: "Works",
  };
}

function manifest(overrides: Partial<RunManifest> = {}): RunManifest {
  return {
    schemaVersion: 1, revision: 1, runId, runMode: "interactive", status: "analyzing",
    targetUrl: "http://127.0.0.1:4173/checkout", editableRoots: ["src/checkout"], baselineCommit: "a".repeat(40),
    createdAt: now, updatedAt: now, toolVersions: { node: "24", playwright: "1", axe: "1", accesspatch: "1" },
    before: { runId, phase: "before", url: "http://127.0.0.1:4173/checkout", capturedAt: now,
      screenshotPath: `${root}/before/s.png`, tracePath: `${root}/before/t.zip`, domPath: `${root}/before/d.html`,
      ariaSnapshotPath: `${root}/before/a.yml`, axeReportPath: `${root}/before/x.json`, keyboardTracePath: `${root}/before/k.json`,
      findings: ids.map(finding), journeyChecks: [{ id: "checkout-completes", label: "Checkout", passed: false, evidencePath: `${root}/before/k.json` }] },
    ...overrides,
  };
}

const proposals = ids.map((findingId) => ({ findingId, diagnosis: `Diagnose ${findingId}`, proposedChange: `Fix ${findingId}`, candidateFiles: ["src/checkout/CheckoutPage.tsx"] }));

describe("workflow state helpers", () => {
  it("writes exactly one canonical checkout proposal per baseline finding before awaiting approval", () => {
    expect(() => writeProposals(manifest(), proposals.slice(0, 2), now)).toThrow(/exactly one/i);
    expect(writeProposals(manifest(), proposals, now)).toMatchObject({ status: "awaiting_approval", proposals });
  });

  it("rejects non-canonical and non-checkout candidate paths", () => {
    expect(() => writeProposals(manifest(), [{ ...proposals[0], candidateFiles: ["src\\checkout\\CheckoutPage.tsx"] }, ...proposals.slice(1)], now)).toThrow(/unsafe|canonical/i);
    expect(() => writeProposals(manifest(), [{ ...proposals[0], candidateFiles: ["tests/unit/workflow-state.test.ts"] }, ...proposals.slice(1)], now)).toThrow(/checkout/i);
  });

  it("makes approved approval the sole awaiting-approval transition to patching", () => {
    const awaiting = writeProposals(manifest(), proposals, now);
    expect(recordApproval(awaiting, { decision: "approved", findingIds: [...ids], actor: "human" }, now)).toMatchObject({ status: "patching" });
    expect(() => recordApproval({ ...awaiting, status: "analyzing" }, { decision: "approved", findingIds: [...ids], actor: "human" }, now)).toThrow(/awaiting/i);
  });

  it("enforces the run-mode approval actor", () => {
    const awaiting = writeProposals(manifest(), proposals, now);
    expect(() => recordApproval(awaiting, { decision: "approved", findingIds: [...ids], actor: "test_fixture" }, now)).toThrow(/actor/i);
    const fixtureAwaiting = writeProposals(manifest({ runMode: "deterministic_fixture" }), proposals, now);
    expect(recordApproval(fixtureAwaiting, { decision: "approved", findingIds: [...ids], actor: "test_fixture" }, now).status).toBe("patching");
  });

  it("records rejection then terminally fails with APPROVAL_REJECTED", () => {
    const awaiting = writeProposals(manifest(), proposals, now);
    const rejected = recordApproval(awaiting, { decision: "rejected", findingIds: [], actor: "human" }, now);
    expect(rejected).toMatchObject({ status: "failed", approval: { decision: "rejected" }, error: { code: "APPROVAL_REJECTED", stage: "awaiting_approval" } });
    expect(() => recordApproval(rejected, { decision: "approved", findingIds: [...ids], actor: "human" }, now)).toThrow(/awaiting/i);
  });
});
