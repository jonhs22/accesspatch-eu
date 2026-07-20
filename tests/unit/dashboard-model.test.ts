import { describe, expect, it } from "vitest";
import type { RunManifest, RunStatus } from "../../src/contracts/run.js";
import {
  createDashboardModel,
  parseDashboardManifest,
} from "../../src/dashboard/dashboard-model.js";

function manifest(status: RunStatus, overrides: Partial<RunManifest> = {}): RunManifest {
  return {
    schemaVersion: 1,
    revision: 0,
    runId: "dashboard-test",
    runMode: "deterministic_fixture",
    status,
    targetUrl: "http://127.0.0.1:4173/checkout",
    editableRoots: ["src/checkout"],
    baselineCommit: "a".repeat(40),
    createdAt: "2026-07-20T18:00:00.000Z",
    updatedAt: "2026-07-20T18:00:00.000Z",
    toolVersions: {
      node: "24.18.0",
      playwright: "1.61.1",
      axe: "4.12.1",
      accesspatch: "1.0.0",
    },
    ...overrides,
  } as RunManifest;
}

describe("dashboard view model", () => {
  it.each<RunStatus>([
    "scanning",
    "analyzing",
    "awaiting_approval",
    "patching",
    "verifying",
    "passed",
    "failed",
  ])("represents %s without inventing unavailable metrics", (status) => {
    const model = createDashboardModel(manifest(status));
    expect(model.kind).toBe("run");
    if (model.kind !== "run") throw new Error("Expected run model");
    expect(model.status).toBe(status);
    expect(model.baselineFindingCount).toBeNull();
    expect(model.resolvedFindingCount).toBeNull();
    expect(model.journey.at(-1)?.state).toBe(
      status === "verifying" || status === "passed" || status === "failed"
        ? "current"
        : "upcoming",
    );
  });

  it("labels deterministic fixture provenance plainly", () => {
    const model = createDashboardModel(manifest("scanning"));
    expect(model.kind).toBe("run");
    if (model.kind !== "run") throw new Error("Expected run model");
    expect(model.provenance).toMatch(/deterministic fixture/i);
    expect(model.provenance).not.toMatch(/human approved/i);
  });

  it("returns explicit missing and corrupt states", () => {
    expect(createDashboardModel(null, "missing")).toEqual({
      kind: "error",
      code: "missing",
      title: "No AccessPatch run found",
      message: expect.stringMatching(/demo:verify/i),
    });
    expect(parseDashboardManifest({ status: "passed", resolved: 3 })).toEqual({
      ok: false,
      code: "corrupt",
      message: expect.stringMatching(/manifest/i),
    });
  });
});
