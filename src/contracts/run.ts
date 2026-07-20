import { z } from "zod";

export const FindingIdSchema = z.enum(["AP-EU-001", "AP-EU-002", "AP-EU-003"]);
export type FindingId = z.infer<typeof FindingIdSchema>;

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

export const LocalTargetUrlSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    url.username === "" &&
    url.password === ""
  );
}, "Target URL must be an unauthenticated http(s) localhost or 127.0.0.1 URL.");

const TimestampSchema = z.string().datetime({ offset: true });
const RunIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Run ID must be a safe path segment.")
  .refine((value) => !value.includes(".."), "Run ID cannot contain '..'.");
const GitPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.includes("\0") &&
      !value.includes("\\") &&
      !value.includes(":") &&
      !value.startsWith("/") &&
      !value.startsWith("//") &&
      !/^[A-Za-z]:/.test(value) &&
      value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    "Path must be a safe repository-relative POSIX Git path.",
  );
const ArtifactPathSchema = GitPathSchema.refine(
  (value) => /^public\/runs\/runtime\/[^/]+\/.+/.test(value),
  "Artifact path must be below public/runs/runtime/<runId>/.",
);

function isSortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => (index === 0 || values[index - 1] < value));
}

function addSortedUniqueIssue(values: readonly string[], context: z.RefinementCtx, label: string): void {
  if (!isSortedUnique(values)) {
    context.addIssue({
      code: "custom",
      message: `${label} must be unique and deterministically sorted.`,
    });
  }
}

export const JourneyCheckSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    passed: z.boolean(),
    evidencePath: ArtifactPathSchema.optional(),
  })
  .strict();
export type JourneyCheck = z.infer<typeof JourneyCheckSchema>;

export const FindingSchema = z
  .object({
    id: FindingIdSchema,
    severity: z.enum(["serious", "critical"]),
    rule: z.string().min(1),
    sourceMarker: z.string().regex(/^ACCESSPATCH-DEMO-00[1-3]$/),
    userImpact: z.string().min(1),
    route: z.string().startsWith("/"),
    journeyStep: z.string().min(1),
    selector: z.string().min(1),
    htmlExcerpt: z.string().min(1),
    wcagTags: z.array(z.string().min(1)).min(1),
    evidencePaths: z.array(ArtifactPathSchema).min(1),
    remediationConstraint: z.string().min(1),
    verificationAssertion: z.string().min(1),
  })
  .strict()
  .superRefine((finding, context) => {
    if (finding.sourceMarker.slice(-3) !== finding.id.slice(-3)) {
      context.addIssue({ code: "custom", message: "Finding ID must match its source marker." });
    }
    addSortedUniqueIssue(finding.wcagTags, context, "WCAG tags");
    addSortedUniqueIssue(finding.evidencePaths, context, "Evidence paths");
  });
export type Finding = z.infer<typeof FindingSchema>;

export const EvidenceSetSchema = z
  .object({
    runId: RunIdSchema,
    phase: z.enum(["before", "after"]),
    url: LocalTargetUrlSchema,
    capturedAt: TimestampSchema,
    screenshotPath: ArtifactPathSchema,
    tracePath: ArtifactPathSchema,
    domPath: ArtifactPathSchema,
    ariaSnapshotPath: ArtifactPathSchema,
    axeReportPath: ArtifactPathSchema,
    keyboardTracePath: ArtifactPathSchema,
    findings: z.array(FindingSchema),
    journeyChecks: z.array(JourneyCheckSchema),
  })
  .strict()
  .superRefine((evidence, context) => {
    addSortedUniqueIssue(
      evidence.findings.map(({ id }) => id),
      context,
      "Finding identities",
    );
    addSortedUniqueIssue(
      evidence.journeyChecks.map(({ id }) => id),
      context,
      "Journey check identities",
    );
  });
export type EvidenceSet = z.infer<typeof EvidenceSetSchema>;

export const FixProposalSchema = z
  .object({
    findingId: FindingIdSchema,
    diagnosis: z.string().min(1),
    proposedChange: z.string().min(1),
    candidateFiles: z.array(GitPathSchema).min(1),
  })
  .strict()
  .superRefine((proposal, context) => {
    addSortedUniqueIssue(proposal.candidateFiles, context, "Candidate files");
  });
export type FixProposal = z.infer<typeof FixProposalSchema>;

export const ApprovalSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    findingIds: z.array(FindingIdSchema),
    actor: z.enum(["human", "test_fixture"]),
    recordedAt: TimestampSchema,
  })
  .strict()
  .superRefine((approval, context) => {
    addSortedUniqueIssue(approval.findingIds, context, "Approval finding identities");
    if (approval.decision === "approved" && approval.findingIds.length === 0) {
      context.addIssue({ code: "custom", message: "Approved decisions require finding IDs." });
    }
  });
export type Approval = z.infer<typeof ApprovalSchema>;

export const VerificationSchema = z
  .object({
    outcome: z.enum(["passed", "failed"]),
    resolvedFindingIds: z.array(FindingIdSchema),
    remainingFindingIds: z.array(FindingIdSchema),
    regressions: z.array(FindingSchema),
    checkoutCompleted: z.boolean(),
    changedFiles: z.array(GitPathSchema),
    diffWithinAllowlist: z.boolean(),
    diffPath: ArtifactPathSchema,
    failureReasons: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((verification, context) => {
    addSortedUniqueIssue(verification.resolvedFindingIds, context, "Resolved finding identities");
    addSortedUniqueIssue(verification.remainingFindingIds, context, "Remaining finding identities");
    addSortedUniqueIssue(
      verification.regressions.map(({ id }) => id),
      context,
      "Regression finding identities",
    );
    addSortedUniqueIssue(verification.changedFiles, context, "Changed files");

    const resolved = new Set(verification.resolvedFindingIds);
    if (verification.remainingFindingIds.some((id) => resolved.has(id))) {
      context.addIssue({
        code: "custom",
        message: "Resolved and remaining finding identities must be disjoint.",
      });
    }

    if (verification.outcome === "failed" && verification.failureReasons.length === 0) {
      context.addIssue({ code: "custom", message: "A failed verification requires a failure reason." });
    }
  });
export type Verification = z.infer<typeof VerificationSchema>;

export const WorkflowErrorSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    stage: z.enum(["scanning", "analyzing", "awaiting_approval", "patching", "verifying"]),
    message: z.string().min(1),
    occurredAt: TimestampSchema,
    retryable: z.boolean(),
  })
  .strict();
export type WorkflowError = z.infer<typeof WorkflowErrorSchema>;

const ToolVersionsSchema = z
  .object({
    node: z.string().min(1),
    playwright: z.string().min(1),
    axe: z.string().min(1),
    accesspatch: z.string().min(1),
  })
  .strict();

const REQUIRED_FINDING_IDS: FindingId[] = ["AP-EU-001", "AP-EU-002", "AP-EU-003"];

function sameIdentities(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export const RunManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    runId: RunIdSchema,
    runMode: z.enum(["interactive", "deterministic_fixture"]),
    status: RunStatusSchema,
    targetUrl: LocalTargetUrlSchema,
    editableRoots: z.tuple([z.literal("src/checkout")]),
    baselineCommit: z.string().regex(/^[0-9a-f]{40}$/),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    toolVersions: ToolVersionsSchema,
    before: EvidenceSetSchema.optional(),
    proposals: z.array(FixProposalSchema).optional(),
    approval: ApprovalSchema.optional(),
    after: EvidenceSetSchema.optional(),
    verification: VerificationSchema.optional(),
    error: WorkflowErrorSchema.optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const evidenceSets = [
      ["before", manifest.before],
      ["after", manifest.after],
    ] as const;
    for (const [field, evidence] of evidenceSets) {
      if (!evidence) continue;
      if (evidence.runId !== manifest.runId) {
        context.addIssue({
          code: "custom",
          path: [field, "runId"],
          message: "Evidence run ID must match the manifest run ID.",
        });
      }
      if (evidence.phase !== field) {
        context.addIssue({
          code: "custom",
          path: [field, "phase"],
          message: `${field} evidence must use the ${field} phase.`,
        });
      }
      const expectedPrefix = `public/runs/runtime/${manifest.runId}/${field}/`;
      const artifactPaths = [
        evidence.screenshotPath,
        evidence.tracePath,
        evidence.domPath,
        evidence.ariaSnapshotPath,
        evidence.axeReportPath,
        evidence.keyboardTracePath,
        ...evidence.findings.flatMap(({ evidencePaths }) => evidencePaths),
        ...evidence.journeyChecks.flatMap(({ evidencePath }) => (evidencePath ? [evidencePath] : [])),
      ];
      if (artifactPaths.some((artifactPath) => !artifactPath.startsWith(expectedPrefix))) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Every evidence artifact path must be scoped to the manifest run ID and phase.",
        });
      }
    }

    const baselineIds = manifest.before?.findings.map(({ id }) => id) ?? [];
    const proposalIds = manifest.proposals?.map(({ findingId }) => findingId) ?? [];
    if (manifest.proposals) {
      addSortedUniqueIssue(proposalIds, context, "Proposal finding identities");
    }

    const requiresBefore = [
      "analyzing",
      "awaiting_approval",
      "patching",
      "verifying",
      "passed",
    ].includes(manifest.status);
    if (requiresBefore && !manifest.before) {
      context.addIssue({ code: "custom", path: ["before"], message: `${manifest.status} requires before evidence.` });
    }

    const requiresProposals = ["awaiting_approval", "patching", "verifying", "passed"].includes(manifest.status);
    if (requiresProposals && !sameIdentities(proposalIds, baselineIds)) {
      context.addIssue({
        code: "custom",
        path: ["proposals"],
        message: "The manifest requires exactly one proposal for every baseline finding.",
      });
    }

    const requiresApproval = ["patching", "verifying", "passed"].includes(manifest.status);
    if (manifest.approval) {
      const expectedActor = manifest.runMode === "interactive" ? "human" : "test_fixture";
      if (manifest.approval.actor !== expectedActor) {
        context.addIssue({
          code: "custom",
          path: ["approval", "actor"],
          message: `${manifest.runMode} runs require approval actor ${expectedActor}.`,
        });
      }
    }
    if (manifest.error && manifest.status !== "failed") {
      context.addIssue({
        code: "custom",
        path: ["error"],
        message: "A structured workflow error is valid only on a failed run.",
      });
    }
    if (requiresApproval) {
      if (manifest.approval?.decision !== "approved") {
        context.addIssue({
          code: "custom",
          path: ["approval"],
          message: `${manifest.status} requires an approved approval.`,
        });
      } else {
        if (!sameIdentities(manifest.approval.findingIds, baselineIds)) {
          context.addIssue({
            code: "custom",
            path: ["approval", "findingIds"],
            message: "Approved finding IDs must exactly match baseline findings.",
          });
        }
      }
    }

    if (["verifying", "passed"].includes(manifest.status) && !manifest.after) {
      context.addIssue({ code: "custom", path: ["after"], message: `${manifest.status} requires after evidence.` });
    }

    if (manifest.verification) {
      const partition = [
        ...manifest.verification.resolvedFindingIds,
        ...manifest.verification.remainingFindingIds,
      ].sort();
      if (!manifest.before || !sameIdentities(partition, baselineIds)) {
        context.addIssue({
          code: "custom",
          path: ["verification"],
          message: "Resolved and remaining finding IDs must exactly partition baseline findings.",
        });
      }
      if (!manifest.verification.diffPath.startsWith(`public/runs/runtime/${manifest.runId}/`)) {
        context.addIssue({
          code: "custom",
          path: ["verification", "diffPath"],
          message: "Verification diff artifact must be scoped to the manifest run ID.",
        });
      }
      if (
        manifest.verification.regressions.some((regression) =>
          regression.evidencePaths.some(
            (artifactPath) =>
              !artifactPath.startsWith(`public/runs/runtime/${manifest.runId}/after/`),
          ),
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["verification", "regressions"],
          message: "Regression artifact paths must be scoped to the manifest run ID after phase.",
        });
      }
      if (manifest.after) {
        const expectedAfterIds = [
          ...new Set([
            ...manifest.verification.remainingFindingIds,
            ...manifest.verification.regressions.map(({ id }) => id),
          ]),
        ].sort();
        const afterIds = manifest.after.findings.map(({ id }) => id);
        if (!sameIdentities(afterIds, expectedAfterIds)) {
          context.addIssue({
            code: "custom",
            path: ["after", "findings"],
            message: "After findings must exactly match remaining findings and regressions.",
          });
        }
      }
    }

    if (manifest.status === "passed") {
      const verification = manifest.verification;
      if (
        verification?.outcome !== "passed" ||
        !sameIdentities(verification.resolvedFindingIds, REQUIRED_FINDING_IDS) ||
        verification.remainingFindingIds.length !== 0 ||
        verification.regressions.length !== 0 ||
        !verification.checkoutCompleted ||
        !verification.diffWithinAllowlist ||
        verification.failureReasons.length !== 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["verification"],
          message: "Passed runs require a complete successful verification receipt for all stable findings.",
        });
      }
    }

    if (manifest.status === "failed") {
      const hasWorkflowErrorRoute = Boolean(manifest.error && !manifest.verification);
      const hasFailedVerificationRoute =
        !manifest.error &&
        manifest.verification?.outcome === "failed" &&
        manifest.verification.failureReasons.length > 0 &&
        Boolean(manifest.before) &&
        Boolean(manifest.after);
      if (Number(hasWorkflowErrorRoute) + Number(hasFailedVerificationRoute) !== 1) {
        context.addIssue({
          code: "custom",
          message: "Failed runs require exactly one honest terminal route: a failed verification with evidence and a reason, or a structured workflow error.",
        });
      }
    }
  });
export type RunManifest = z.infer<typeof RunManifestSchema>;
