import {
  RunManifestSchema,
  type RunManifest,
  type RunStatus,
} from "../contracts/run.js";

export type DashboardLoadError = "missing" | "corrupt";
export type JourneyState = "done" | "current" | "upcoming";

export interface DashboardJourneyStep {
  id: "scan" | "analyze" | "approve" | "patch" | "verify";
  label: string;
  state: JourneyState;
}

export interface DashboardErrorModel {
  kind: "error";
  code: DashboardLoadError;
  title: string;
  message: string;
}

export interface DashboardRunModel {
  kind: "run";
  status: RunStatus;
  statusLabel: string;
  tone: "working" | "attention" | "success" | "failure";
  runId: string;
  targetUrl: string;
  provenance: string;
  baselineFindingCount: number | null;
  resolvedFindingCount: number | null;
  journey: DashboardJourneyStep[];
  manifest: RunManifest;
}

export type DashboardModel = DashboardErrorModel | DashboardRunModel;

const stepDefinitions: Array<Pick<DashboardJourneyStep, "id" | "label">> = [
  { id: "scan", label: "Capture" },
  { id: "analyze", label: "Correlate" },
  { id: "approve", label: "Approve" },
  { id: "patch", label: "Patch" },
  { id: "verify", label: "Verify" },
];

const statusStep: Record<RunStatus, number> = {
  scanning: 0,
  analyzing: 1,
  awaiting_approval: 2,
  patching: 3,
  verifying: 4,
  passed: 4,
  failed: 4,
};

const statusLabels: Record<RunStatus, string> = {
  scanning: "Capturing baseline",
  analyzing: "Correlating evidence",
  awaiting_approval: "Awaiting explicit approval",
  patching: "Applying approved patch",
  verifying: "Replaying keyboard journey",
  passed: "Verified repair",
  failed: "Run stopped honestly",
};

function toneFor(status: RunStatus): DashboardRunModel["tone"] {
  if (status === "passed") return "success";
  if (status === "failed") return "failure";
  if (status === "awaiting_approval") return "attention";
  return "working";
}

export function parseDashboardManifest(
  input: unknown,
): { ok: true; manifest: RunManifest } | { ok: false; code: "corrupt"; message: string } {
  const parsed = RunManifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "corrupt",
      message: "The run manifest is corrupt or does not match the AccessPatch v1 contract.",
    };
  }
  return { ok: true, manifest: parsed.data };
}

export function createDashboardModel(
  manifest: RunManifest | null,
  loadError: DashboardLoadError = "missing",
): DashboardModel {
  if (!manifest) {
    return loadError === "corrupt"
      ? {
          kind: "error",
          code: "corrupt",
          title: "Run evidence could not be trusted",
          message: "The manifest is corrupt. Reset the demo and create a new evidence run.",
        }
      : {
          kind: "error",
          code: "missing",
          title: "No AccessPatch run found",
          message: "Run npm run demo:verify to create a reproducible evidence receipt.",
        };
  }

  const currentStep = statusStep[manifest.status];
  return {
    kind: "run",
    status: manifest.status,
    statusLabel: statusLabels[manifest.status],
    tone: toneFor(manifest.status),
    runId: manifest.runId,
    targetUrl: manifest.targetUrl,
    provenance:
      manifest.runMode === "deterministic_fixture"
        ? "Deterministic fixture run · approval actor: test_fixture"
        : manifest.approval?.actor === "human"
          ? "Interactive run · explicitly human approved"
          : "Interactive run · human approval pending",
    baselineFindingCount: manifest.before ? manifest.before.findings.length : null,
    resolvedFindingCount: manifest.verification
      ? manifest.verification.resolvedFindingIds.length
      : null,
    journey: stepDefinitions.map((step, index) => ({
      ...step,
      state: index < currentStep ? "done" : index === currentStep ? "current" : "upcoming",
    })),
    manifest,
  };
}
