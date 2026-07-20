import { open, rm, type FileHandle } from "node:fs/promises";
import path from "node:path";
import {
  PROJECT_ROOT,
  assertInsideProject,
  ensureProjectDirectory,
} from "./paths.js";
import {
  attemptCleanup,
  cleanupAggregateError,
  type CleanupFailure,
} from "./cleanup.js";

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export interface FixtureLockOptions {
  closeHandle?: (handle: FileHandle) => Promise<void>;
  remove?: (candidate: string) => Promise<void>;
}

export async function withFixtureLock<T>(
  action: () => Promise<T>,
  projectRoot = PROJECT_ROOT,
  options: FixtureLockOptions = {},
): Promise<T> {
  const runsDirectory = path.join(assertInsideProject(projectRoot), "public", "runs");
  await ensureProjectDirectory(runsDirectory);
  const lockPath = assertInsideProject(path.join(runsDirectory, ".fixture-reset.lock"));

  let lockHandle;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      lockHandle = await open(lockPath, "wx", 0o600);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 99) throw error;
      await delay(10);
    }
  }
  if (!lockHandle) throw new Error("Unable to acquire the fixture/reset lock.");

  const closeHandle = options.closeHandle ?? ((handle: FileHandle) => handle.close());
  const remove = options.remove ?? ((candidate: string) => rm(candidate, { force: true }));
  let result: T | undefined;
  let primaryError: unknown;
  let actionFailed = false;
  try {
    result = await action();
  } catch (error) {
    actionFailed = true;
    primaryError = error;
  }

  const cleanupFailures: CleanupFailure[] = [];
  await attemptCleanup(cleanupFailures, "fixture lock handle close", () =>
    closeHandle(lockHandle),
  );
  await attemptCleanup(cleanupFailures, "fixture lock removal", () =>
    remove(lockPath),
  );

  if (actionFailed) throw primaryError;
  if (cleanupFailures.length > 0) {
    throw cleanupAggregateError("Fixture lock", cleanupFailures);
  }
  return result as T;
}
