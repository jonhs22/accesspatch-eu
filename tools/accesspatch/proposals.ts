import {
  RunManifestSchema,
  type FixProposal,
  type RunManifest,
} from "../../src/contracts/run.js";
import { normalizeGitPath } from "./git-guard.js";

function baselineIds(manifest: RunManifest): string[] {
  if (!manifest.before) throw new Error("Proposals require baseline before evidence.");
  return manifest.before.findings.map(({ id }) => id);
}

/** Records the only analyzing -> awaiting_approval transition. */
export function writeProposals(
  manifest: RunManifest,
  proposals: readonly FixProposal[],
  updatedAt = new Date().toISOString(),
): RunManifest {
  if (manifest.status !== "analyzing") {
    throw new Error(`Proposals require analyzing status, received ${manifest.status}.`);
  }
  const expected = baselineIds(manifest);
  const normalized = proposals.map((proposal) => ({
    ...proposal,
    candidateFiles: proposal.candidateFiles.map((candidate) => {
      const canonical = normalizeGitPath(candidate);
      if (!canonical.startsWith("src/checkout/")) {
        throw new Error(`Proposal candidate must be under src/checkout: ${candidate}`);
      }
      return canonical;
    }),
  }));
  const found = normalized.map(({ findingId }) => findingId).sort();
  if (found.length !== expected.length || found.some((id, index) => id !== expected[index])) {
    throw new Error("Proposals must contain exactly one proposal for every baseline finding.");
  }
  return RunManifestSchema.parse({
    ...manifest,
    revision: manifest.revision + 1,
    status: "awaiting_approval",
    updatedAt,
    proposals: normalized.sort((left, right) => left.findingId.localeCompare(right.findingId)),
  });
}
