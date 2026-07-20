import {
  VerificationSchema,
  type EvidenceSet,
  type Finding,
  type Verification,
} from "../../src/contracts/run.js";
import { validateProductPatch } from "./git-guard.js";

export interface VerifyOptions {
  changedFiles: readonly string[];
  approvedCandidateFiles: readonly string[];
  diffPath: string;
}
const REQUIRED_FINDING_IDS = ["AP-EU-001", "AP-EU-002", "AP-EU-003"] as const;

function compareFindings(before: EvidenceSet, after: EvidenceSet) {
  const baseline = new Set(before.findings.map(({ id }) => id));
  const remaining = after.findings.filter(({ id }) => baseline.has(id)).map(({ id }) => id).sort();
  const resolved = before.findings.map(({ id }) => id).filter((id) => !remaining.includes(id)).sort();
  const regressions = after.findings.filter((finding) => !baseline.has(finding.id) && (finding.severity === "serious" || finding.severity === "critical")) as Finding[];
  return { resolved, remaining, regressions: regressions.sort((left, right) => left.id.localeCompare(right.id)) };
}

export function verify(before: EvidenceSet, after: EvidenceSet, options: VerifyOptions): Verification {
  if (before.runId !== after.runId) throw new Error("Before and after evidence must use the same run ID.");
  const { resolved, remaining, regressions } = compareFindings(before, after);
  const patch = validateProductPatch(options.changedFiles, options.approvedCandidateFiles);
  const checkoutCompleted = after.journeyChecks.some((check) => check.id === "checkout-completes" && check.passed);
  const baselineJourneys = new Map(before.journeyChecks.map((check) => [check.id, check.passed]));
  const journeyRegression = after.journeyChecks.some((check) => baselineJourneys.get(check.id) === true && !check.passed);
  const failureReasons: string[] = [];
  if (remaining.length) failureReasons.push("Baseline findings remain after repair.");
  if (regressions.length) failureReasons.push("New serious or critical accessibility findings were introduced.");
  if (!checkoutCompleted) failureReasons.push("Checkout journey did not complete.");
  if (journeyRegression) failureReasons.push("A previously passing journey regressed.");
  if (!patch.withinAllowlist) failureReasons.push(`Changed files are outside the approved allowlist: ${patch.rejectedPaths.join(", ")}.`);
  if (resolved.length !== REQUIRED_FINDING_IDS.length || resolved.some((id, index) => id !== REQUIRED_FINDING_IDS[index])) {
    failureReasons.push("Verification must resolve all stable baseline findings.");
  }
  return VerificationSchema.parse({
    outcome: failureReasons.length === 0 ? "passed" : "failed",
    resolvedFindingIds: resolved,
    remainingFindingIds: remaining,
    regressions,
    checkoutCompleted,
    changedFiles: patch.changedFiles,
    diffWithinAllowlist: patch.withinAllowlist,
    diffPath: options.diffPath,
    failureReasons,
  });
}
