import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rm,
  stat,
  symlink,
  unlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunManifest } from "../../src/contracts/run.js";
import { withFixtureLock } from "../../tools/accesspatch/fixture-lock.js";
import { PROJECT_ROOT } from "../../tools/accesspatch/paths.js";
import { RunStore } from "../../tools/accesspatch/run-store.js";

const timestamp = "2026-07-20T12:00:00.000Z";
let testRoot: string;
let outsideRoot: string;
let publicLink: string;

function manifest(): RunManifest {
  return {
    schemaVersion: 1,
    revision: 0,
    runId: "junction-defense",
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
  };
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

beforeEach(async () => {
  testRoot = path.join(
    PROJECT_ROOT,
    ".superpowers",
    "sdd",
    "junction-defense",
    randomUUID(),
  );
  outsideRoot = await mkdtemp(path.join(os.tmpdir(), "accesspatch-outside-"));
  publicLink = path.join(testRoot, "public");
  await mkdir(testRoot, { recursive: true });
  await symlink(
    outsideRoot,
    publicLink,
    process.platform === "win32" ? "junction" : "dir",
  );
});

afterEach(async () => {
  await unlink(publicLink).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  await rm(testRoot, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
});

describe("directory mutation containment", () => {
  it("RunStore rejects a junction before creating its outside runs directory", async () => {
    const store = new RunStore(testRoot);
    await expect(store.write(manifest())).rejects.toThrow(/outside project root/i);
    expect(await exists(path.join(outsideRoot, "runs"))).toBe(false);
  });

  it("fixture locking rejects a junction before creating its outside runs directory", async () => {
    let actionCalled = false;
    await expect(
      withFixtureLock(async () => {
        actionCalled = true;
      }, testRoot),
    ).rejects.toThrow(/outside project root/i);

    expect(actionCalled).toBe(false);
    expect(await exists(path.join(outsideRoot, "runs"))).toBe(false);
  });
});
