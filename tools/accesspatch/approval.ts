import {
  RunManifestSchema,
  type Approval,
  type RunManifest,
} from "../../src/contracts/run.js";

export type ApprovalInput = Omit<Approval, "recordedAt">;

/** Records the only awaiting_approval -> patching transition, or a terminal rejection. */
export function recordApproval(
  manifest: RunManifest,
  input: ApprovalInput,
  recordedAt = new Date().toISOString(),
): RunManifest {
  if (manifest.status !== "awaiting_approval") {
    throw new Error(`Approval requires awaiting_approval status, received ${manifest.status}.`);
  }
  const actor = manifest.runMode === "interactive" ? "human" : "test_fixture";
  if (input.actor !== actor) {
    throw new Error(`${manifest.runMode} approval requires actor ${actor}.`);
  }
  const approval = { ...input, findingIds: [...input.findingIds].sort(), recordedAt };
  const baselineIds = manifest.before?.findings.map(({ id }) => id) ?? [];
  if (input.decision === "approved") {
    if (approval.findingIds.length !== baselineIds.length || approval.findingIds.some((id, index) => id !== baselineIds[index])) {
      throw new Error("Approved finding IDs must exactly match baseline findings.");
    }
    return RunManifestSchema.parse({
      ...manifest, revision: manifest.revision + 1, status: "patching", updatedAt: recordedAt, approval,
    });
  }
  return RunManifestSchema.parse({
    ...manifest,
    revision: manifest.revision + 1,
    status: "failed",
    updatedAt: recordedAt,
    approval,
    error: {
      code: "APPROVAL_REJECTED",
      stage: "awaiting_approval",
      message: "The repair proposal was rejected.",
      occurredAt: recordedAt,
      retryable: false,
    },
  });
}
