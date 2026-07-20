import { open, rm } from "node:fs/promises";
import path from "node:path";
import {
  PROJECT_ROOT,
  assertInsideProject,
  ensureProjectDirectory,
} from "./paths.js";

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function withFixtureLock<T>(
  action: () => Promise<T>,
  projectRoot = PROJECT_ROOT,
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

  try {
    return await action();
  } finally {
    await lockHandle.close();
    await rm(lockPath, { force: true });
  }
}
