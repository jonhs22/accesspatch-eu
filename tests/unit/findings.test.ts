import { describe, expect, it } from "vitest";
import { FindingSchema } from "../../src/contracts/run.js";
import { buildFindings } from "../../tools/accesspatch/findings.js";

describe("buildFindings", () => {
  it("maps observed marker-backed evidence to the stable three IDs", () => {
    const findings = buildFindings({
      axeButtonUnnamed: true,
      repeatedFocusTargets: ["email", "email", "email", "email", "email"],
      visibleErrorIsLive: false,
      sourceMarkers: [
        "ACCESSPATCH-DEMO-001",
        "ACCESSPATCH-DEMO-002",
        "ACCESSPATCH-DEMO-003",
      ],
      evidencePaths: {
        axe: "public/runs/runtime/run-test/before/axe.json",
        aria: "public/runs/runtime/run-test/before/aria.yml",
        keyboard: "public/runs/runtime/run-test/before/keyboard.json",
      },
    });

    expect(findings.map(({ id }) => id)).toEqual([
      "AP-EU-001",
      "AP-EU-002",
      "AP-EU-003",
    ]);
    for (const finding of findings) {
      expect(FindingSchema.parse(finding)).toEqual(finding);
      expect(finding.sourceMarker).toBe(`ACCESSPATCH-DEMO-${finding.id.slice(-3)}`);
      expect(finding.userImpact).not.toBe("");
      expect(finding.selector).not.toBe("");
      expect(finding.htmlExcerpt).not.toBe("");
      expect(finding.wcagTags.length).toBeGreaterThan(0);
      expect(finding.evidencePaths.length).toBeGreaterThan(0);
      expect(finding.remediationConstraint).not.toBe("");
      expect(finding.verificationAssertion).not.toBe("");
    }
  });

  it("does not invent findings without both runtime evidence and a source marker", () => {
    const findings = buildFindings({
      axeButtonUnnamed: true,
      repeatedFocusTargets: ["email", "email", "email", "email", "email"],
      visibleErrorIsLive: true,
      sourceMarkers: ["ACCESSPATCH-DEMO-001"],
      evidencePaths: {
        axe: "public/runs/runtime/run-test/before/axe.json",
        aria: "public/runs/runtime/run-test/before/aria.yml",
        keyboard: "public/runs/runtime/run-test/before/keyboard.json",
      },
    });

    expect(findings.map(({ id }) => id)).toEqual(["AP-EU-001"]);
  });
});
