import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withFixtureLock } from "../../tools/accesspatch/fixture-lock.js";
import { PROJECT_ROOT } from "../../tools/accesspatch/paths.js";

let testRoot: string;
const lockPath = () => path.join(testRoot, "public", "runs", ".fixture-reset.lock");

beforeEach(async () => {
  testRoot = path.join(
    PROJECT_ROOT,
    ".superpowers",
    "sdd",
    "fixture-lock-cleanup",
    randomUUID(),
  );
  await mkdir(testRoot, { recursive: true });
});

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe("withFixtureLock cleanup", () => {
  it("preserves the action error while attempting close and lock removal", async () => {
    const primary = new Error("fixture action failed");
    const closeFailure = new Error("fixture close failed");
    const removeFailure = new Error("fixture remove failed");
    const operations: string[] = [];

    await expect(
      withFixtureLock(
        async () => {
          throw primary;
        },
        testRoot,
        {
          closeHandle: async (handle) => {
            operations.push("close");
            await handle.close();
            throw closeFailure;
          },
          remove: async (candidate) => {
            operations.push("remove");
            await rm(candidate, { force: true });
            throw removeFailure;
          },
        },
      ),
    ).rejects.toBe(primary);
    expect(operations).toEqual(["close", "remove"]);
    await expect(readFile(lockPath())).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("aggregates cleanup failures after successful action and leaves no stale lock", async () => {
    const closeFailure = new Error("fixture close failed");
    const removeFailure = new Error("fixture remove failed");
    const operations: string[] = [];

    const rejection = await withFixtureLock(
      async () => "captured",
      testRoot,
      {
        closeHandle: async (handle) => {
          operations.push("close");
          await handle.close();
          throw closeFailure;
        },
        remove: async (candidate) => {
          operations.push("remove");
          await rm(candidate, { force: true });
          throw removeFailure;
        },
      },
    ).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(AggregateError);
    expect((rejection as AggregateError).errors).toEqual([
      closeFailure,
      removeFailure,
    ]);
    expect(operations).toEqual(["close", "remove"]);
    await expect(readFile(lockPath())).rejects.toMatchObject({ code: "ENOENT" });
  });
});
