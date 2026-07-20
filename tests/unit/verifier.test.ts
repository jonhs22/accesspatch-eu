import { describe, expect, it } from "vitest";
import { verify } from "../../tools/accesspatch/verifier.js";
import type { EvidenceSet, Finding } from "../../src/contracts/run.js";

const id = "run-task-4"; const root = `public/runs/runtime/${id}`; const now = "2026-07-20T12:00:00.000Z";
const ids = ["AP-EU-001", "AP-EU-002", "AP-EU-003"] as const;
function finding(findingId: (typeof ids)[number]): Finding { return { id: findingId, severity: findingId === "AP-EU-003" ? "serious" : "critical", rule: findingId, sourceMarker: `ACCESSPATCH-DEMO-${findingId.slice(-3)}`, userImpact: "Impact", route: "/checkout", journeyStep: "Checkout", selector: "button", htmlExcerpt: "<button />", wcagTags: ["wcag2a"], evidencePaths: [`${root}/after/${findingId}.json`], remediationConstraint: "Keep", verificationAssertion: "Works" }; }
function evidence(phase: "before" | "after", findings: Finding[], complete: boolean, runId = id): EvidenceSet { const p = `public/runs/runtime/${runId}/${phase}`; return { runId, phase, url: "http://127.0.0.1:4173/checkout", capturedAt: now, screenshotPath: `${p}/s.png`, tracePath: `${p}/t.zip`, domPath: `${p}/d.html`, ariaSnapshotPath: `${p}/a.yml`, axeReportPath: `${p}/x.json`, keyboardTracePath: `${p}/k.json`, findings, journeyChecks: [{ id: "checkout-completes", label: "Checkout", passed: complete, evidencePath: `${p}/k.json` }] }; }
const before = evidence("before", ids.map(finding), false);
const success = () => verify(before, evidence("after", [], true), { changedFiles: ["src/checkout/CheckoutPage.tsx"], approvedCandidateFiles: ["src/checkout/CheckoutPage.tsx"], diffPath: `${root}/verification/diff.patch` });

describe("verification receipt", () => {
  it("passes only when the complete repair has no remaining findings or regressions", () => {
    expect(success()).toMatchObject({ outcome: "passed", resolvedFindingIds: ["AP-EU-001", "AP-EU-002", "AP-EU-003"], remainingFindingIds: [], regressions: [], checkoutCompleted: true });
  });
  it("does not pass a receipt that resolves fewer than all stable findings", () => {
    const partialBefore = evidence("before", [finding("AP-EU-001"), finding("AP-EU-002")], false);
    expect(verify(partialBefore, evidence("after", [], true), { changedFiles: ["src/checkout/CheckoutPage.tsx"], approvedCandidateFiles: ["src/checkout/CheckoutPage.tsx"], diffPath: `${root}/verification/diff.patch` })).toMatchObject({ outcome: "failed" });
  });
  it("fails unresolved baseline findings", () => expect(verify(before, evidence("after", [finding("AP-EU-001")], true), { changedFiles: [], approvedCandidateFiles: [], diffPath: `${root}/verification/diff.patch` })).toMatchObject({ outcome: "failed", remainingFindingIds: ["AP-EU-001"] }));
  it("fails a new serious or critical axe finding", () => { const baseline = evidence("before", [finding("AP-EU-001"), finding("AP-EU-002")], false); const newFinding = finding("AP-EU-003"); expect(verify(baseline, evidence("after", [newFinding], true), { changedFiles: [], approvedCandidateFiles: [], diffPath: `${root}/verification/diff.patch` })).toMatchObject({ outcome: "failed", regressions: [newFinding] }); });
  it("fails an incomplete checkout journey", () => expect(verify(before, evidence("after", [], false), { changedFiles: [], approvedCandidateFiles: [], diffPath: `${root}/verification/diff.patch` })).toMatchObject({ outcome: "failed", checkoutCompleted: false }));
  it("rejects mismatched evidence run IDs", () => expect(() => verify(before, evidence("after", [], true, "other-run"), { changedFiles: [], approvedCandidateFiles: [], diffPath: `${root}/verification/diff.patch` })).toThrow(/run ID/i));
  it("fails out-of-scope changed files", () => expect(verify(before, evidence("after", [], true), { changedFiles: ["tests/unit/verifier.test.ts"], approvedCandidateFiles: ["src/checkout/CheckoutPage.tsx"], diffPath: `${root}/verification/diff.patch` })).toMatchObject({ outcome: "failed", diffWithinAllowlist: false }));
});
