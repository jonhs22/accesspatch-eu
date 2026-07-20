import { z } from "zod";

export const FindingIdSchema = z.enum(["AP-EU-001", "AP-EU-002", "AP-EU-003"]);
export type FindingId = z.infer<typeof FindingIdSchema>;

export const EvidenceSchema = z.object({
  path: z.string().min(1),
  label: z.string().min(1).optional(),
  kind: z.enum(["screenshot", "axe", "trace", "report", "other"]).optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const EvidenceSetSchema = z.object({
  before: z.array(EvidenceSchema).default([]),
  after: z.array(EvidenceSchema).default([]),
});
export type EvidenceSet = z.infer<typeof EvidenceSetSchema>;

export const JourneyCheckSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  passed: z.boolean().optional(),
  evidencePath: z.string().min(1).optional(),
});
export type JourneyCheck = z.infer<typeof JourneyCheckSchema>;

export const FixProposalSchema = z.object({
  id: z.string().min(1),
  findingIds: z.array(FindingIdSchema).min(1),
  summary: z.string().min(1),
  files: z.array(z.string().min(1)).min(1),
});
export type FixProposal = z.infer<typeof FixProposalSchema>;

export const HumanApprovalSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  approvedProposalIds: z.array(z.string().min(1)).default([]),
  reviewer: z.string().min(1).optional(),
  note: z.string().optional(),
});
export type HumanApproval = z.infer<typeof HumanApprovalSchema>;

export const VerificationSchema = z
  .object({
    outcome: z.enum(["passed", "failed"]),
    resolvedFindingIds: z.array(FindingIdSchema),
    remainingFindingIds: z.array(FindingIdSchema),
    regressions: z.array(z.string().min(1)),
    checkoutCompleted: z.boolean(),
    diffPath: z.string().min(1),
  })
  .superRefine((verification, context) => {
    if (
      verification.outcome === "passed" &&
      (verification.remainingFindingIds.length > 0 || verification.regressions.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "A passed verification cannot contain remaining findings or regressions.",
      });
    }
  });
export type Verification = z.infer<typeof VerificationSchema>;

export const RunStatusSchema = z.enum([
  "scanning",
  "analyzing",
  "awaiting_approval",
  "patching",
  "verifying",
  "passed",
  "failed",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

const LocalTargetUrlSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    url.username === "" &&
    url.password === ""
  );
}, "Target URL must be an unauthenticated http(s) localhost or 127.0.0.1 URL.");

export const RunManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().min(1),
    status: RunStatusSchema,
    targetUrl: LocalTargetUrlSchema,
    editableRoots: z.tuple([z.literal("src/checkout")]),
    findings: z.array(FindingIdSchema).default([]),
    evidence: EvidenceSetSchema.default({ before: [], after: [] }),
    journeyChecks: z.array(JourneyCheckSchema).default([]),
    proposals: z.array(FixProposalSchema).default([]),
    approval: HumanApprovalSchema.optional(),
    verification: VerificationSchema.optional(),
  })
  .superRefine((manifest, context) => {
    if (manifest.status === "awaiting_approval" && manifest.proposals.length === 0) {
      context.addIssue({ code: "custom", message: "Awaiting approval requires at least one proposal." });
    }

    if (manifest.status === "patching" || manifest.status === "verifying") {
      if (manifest.approval?.decision !== "approved") {
        context.addIssue({ code: "custom", message: `${manifest.status} requires approved human approval.` });
      } else if (manifest.approval.approvedProposalIds.length === 0) {
        context.addIssue({ code: "custom", message: `${manifest.status} requires an approved proposal.` });
      } else {
        const proposalIds = new Set(manifest.proposals.map((proposal) => proposal.id));
        if (manifest.approval.approvedProposalIds.some((id) => !proposalIds.has(id))) {
          context.addIssue({
            code: "custom",
            message: "Every approved proposal ID must correspond to a manifest proposal.",
          });
        }
      }
    }

    if (manifest.status === "passed" && manifest.verification?.outcome !== "passed") {
      context.addIssue({ code: "custom", message: "Passed runs require a passed verification." });
    }

    if (manifest.status === "failed" && manifest.verification?.outcome !== "failed") {
      context.addIssue({ code: "custom", message: "Failed runs require a failed verification." });
    }
  });
export type RunManifest = z.infer<typeof RunManifestSchema>;
