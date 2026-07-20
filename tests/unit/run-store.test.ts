import { mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunManifest } from "../../src/contracts/run.js";
import { PROJECT_ROOT } from "../../tools/accesspatch/paths.js";
import { RunStore } from "../../tools/accesspatch/run-store.js";

const timestamp = "2026-07-20T12:00:00.000Z";
let testRoot: string;
let store: RunStore;

function validManifest(overrides: Partial<RunManifest> = {}): RunManifest {
  return {
    schemaVersion: 1,
    revision: 0,
    runId: "run-store-test",
    runMode: "interactive",
    status: "scanning",
    targetUrl: "http://127.0.0.1:4173/checkout",
    editableRoots: ["src/checkout"],
    baselineCommit: "a".repeat(40),
    createdAt: timestamp,
    updatedAt: timestamp,
    toolVersions: {
      node: "24.18.0",
      playwright: "1.61.1",
      axe: "4.12.1",
      accesspatch: "1.0.0",
    },
    ...overrides,
  };
}

beforeEach(async () => {
  testRoot = path.join(PROJECT_ROOT, ".superpowers", "sdd", "task-3-runtime", randomUUID());
  await mkdir(testRoot, { recursive: true });
  store = new RunStore(testRoot);
});

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe("RunStore", () => {
  it("reads an absent store without creating its runs directory", async () => {
    expect(await store.read()).toBeUndefined();
    await expect(readdir(path.join(testRoot, "public", "runs"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("publishes only a fully validated manifest and leaves no writer temp", async () => {
    const manifest = validManifest();
    await store.write(manifest);

    const currentPath = path.join(testRoot, "public", "runs", "current.json");
    expect(JSON.parse(await readFile(currentPath, "utf8"))).toEqual(manifest);
    expect((await readdir(path.dirname(currentPath))).filter((name) => /^\.current\..+\.tmp$/.test(name))).toEqual([]);
  });

  it("keeps the prior manifest when the replacement is invalid", async () => {
    const original = validManifest();
    await store.write(original);

    await expect(
      store.write(
        { ...original, revision: 1, targetUrl: "https://example.com/checkout" } as RunManifest,
        { runId: original.runId, revision: 0, expectedStatus: "scanning" },
      ),
    ).rejects.toThrow();
    expect(await store.read()).toEqual(original);
    expect((await readdir(path.join(testRoot, "public", "runs"))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("keeps current intact and cleans only its own temp after rename failure", async () => {
    const original = validManifest();
    await store.write(original);
    const failingStore = new RunStore(testRoot, {
      rename: async () => {
        expect(await failingStore.read()).toEqual(original);
        const error = new Error("simulated sharing violation") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      },
      renameRetryDelayMs: 0,
    });
    const replacement = validManifest({
      revision: 1,
      status: "failed",
      error: {
        code: "SCAN_FAILED",
        stage: "scanning",
        message: "Evidence capture failed.",
        occurredAt: timestamp,
        retryable: true,
      },
    });

    await expect(
      failingStore.write(replacement, {
        runId: original.runId,
        revision: 0,
        expectedStatus: "scanning",
      }),
    ).rejects.toThrow("simulated sharing violation");
    expect(await store.read()).toEqual(original);
    expect((await readdir(path.join(testRoot, "public", "runs"))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("attempts temp, handle, and lock cleanup independently while preserving the primary error", async () => {
    const primary = new Error("rename primary failure");
    const cleanup = new Error("simulated cleanup failure");
    const operations: string[] = [];
    const cleanupStore = new RunStore(testRoot, {
      rename: async () => {
        throw primary;
      },
      closeHandle: async (handle, kind) => {
        operations.push(`close:${kind}`);
        await handle.close();
        if (kind === "lock") throw cleanup;
      },
      remove: async (candidate) => {
        const kind = candidate.endsWith(".lock") ? "lock" : "temp";
        operations.push(`remove:${kind}`);
        await rm(candidate, { force: true });
        if (kind === "temp") throw cleanup;
      },
      renameRetryDelayMs: 0,
    });

    await expect(cleanupStore.write(validManifest())).rejects.toBe(primary);
    expect(operations).toEqual([
      "close:temporary",
      "remove:temp",
      "close:lock",
      "remove:lock",
    ]);
    await expect(readFile(path.join(testRoot, "public", "runs", ".current.lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("continues cleanup after temporary handle close fails and aggregates cleanup-only errors", async () => {
    const cleanup = new Error("temporary close failed");
    const operations: string[] = [];
    const cleanupStore = new RunStore(testRoot, {
      closeHandle: async (handle, kind) => {
        operations.push(`close:${kind}`);
        await handle.close();
        if (kind === "temporary") throw cleanup;
      },
      remove: async (candidate) => {
        operations.push(candidate.endsWith(".lock") ? "remove:lock" : "remove:temp");
        await rm(candidate, { force: true });
      },
    });

    const rejection = await cleanupStore.write(validManifest()).catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(AggregateError);
    expect((rejection as AggregateError).errors).toContain(cleanup);
    expect(operations).toEqual([
      "close:temporary",
      "remove:temp",
      "close:lock",
      "remove:lock",
    ]);
    await expect(readFile(path.join(testRoot, "public", "runs", ".current.lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("aggregates lock close and removal failures after attempting both", async () => {
    const closeFailure = new Error("lock close failed");
    const removeFailure = new Error("lock removal failed");
    const operations: string[] = [];
    const cleanupStore = new RunStore(testRoot, {
      closeHandle: async (handle, kind) => {
        operations.push(`close:${kind}`);
        await handle.close();
        if (kind === "lock") throw closeFailure;
      },
      remove: async (candidate) => {
        const kind = candidate.endsWith(".lock") ? "lock" : "temp";
        operations.push(`remove:${kind}`);
        await rm(candidate, { force: true });
        if (kind === "lock") throw removeFailure;
      },
    });

    const rejection = await cleanupStore.write(validManifest()).catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(AggregateError);
    expect((rejection as AggregateError).errors).toEqual([
      closeFailure,
      removeFailure,
    ]);
    expect(operations).toEqual([
      "close:temporary",
      "close:lock",
      "remove:lock",
    ]);
    await expect(readFile(path.join(testRoot, "public", "runs", ".current.lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.runIf(process.platform === "win32")("retries bounded Windows rename sharing violations", async () => {
    let attempts = 0;
    const retryingStore = new RunStore(testRoot, {
      rename: async (from, to) => {
        attempts += 1;
        if (attempts < 3) {
          const error = new Error("busy") as NodeJS.ErrnoException;
          error.code = "EBUSY";
          throw error;
        }
        await rename(from, to);
      },
      renameRetryDelayMs: 0,
    });

    await retryingStore.write(validManifest());
    expect(attempts).toBe(3);
    expect(await retryingStore.read()).toEqual(validManifest());
  });

  it("compare-and-swaps run ID, revision, and expected status", async () => {
    const original = validManifest();
    await store.write(original);
    const analyzing = validManifest({
      revision: 1,
      status: "failed",
      updatedAt: "2026-07-20T12:01:00.000Z",
      error: {
        code: "SCAN_FAILED",
        stage: "scanning",
        message: "Evidence capture failed.",
        occurredAt: "2026-07-20T12:01:00.000Z",
        retryable: true,
      },
    });

    await expect(
      store.write(analyzing, {
        runId: "another-run",
        revision: 0,
        expectedStatus: "scanning",
      }),
    ).rejects.toThrow(/compare-and-swap/i);
    await expect(
      store.write(analyzing, {
        runId: original.runId,
        revision: 7,
        expectedStatus: "scanning",
      }),
    ).rejects.toThrow(/compare-and-swap/i);
    await expect(
      store.write(analyzing, {
        runId: original.runId,
        revision: 0,
        expectedStatus: "analyzing",
      }),
    ).rejects.toThrow(/compare-and-swap/i);

    await store.write(analyzing, {
      runId: original.runId,
      revision: 0,
      expectedStatus: "scanning",
    });
    expect(await store.read()).toEqual(analyzing);
  });

  it("refuses an unguarded overwrite of an existing current manifest", async () => {
    await store.write(validManifest());
    await expect(store.write(validManifest({ runId: "new-run" }))).rejects.toThrow(/compare-and-swap/i);
  });
});
