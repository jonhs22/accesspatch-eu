import {
  open,
  readFile,
  rename as fsRename,
  rm,
  type FileHandle,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  RunManifestSchema,
  type RunManifest,
  type RunStatus,
} from "../../src/contracts/run.js";
import { assertInsideProject, ensureProjectDirectory } from "./paths.js";
import {
  attemptCleanup,
  cleanupAggregateError,
  type CleanupFailure,
} from "./cleanup.js";

export interface RunStoreExpectation {
  runId: string;
  revision: number;
  expectedStatus: RunStatus;
}

export interface RunStoreOptions {
  rename?: (from: string, to: string) => Promise<void>;
  renameRetryDelayMs?: number;
  closeHandle?: (
    handle: FileHandle,
    kind: "temporary" | "lock",
  ) => Promise<void>;
  remove?: (candidate: string) => Promise<void>;
}

const WINDOWS_RETRYABLE_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);
const WINDOWS_RENAME_ATTEMPTS = 5;

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class RunStore {
  readonly currentPath: string;
  readonly runsDirectory: string;
  readonly lockPath: string;
  private readonly rename: (from: string, to: string) => Promise<void>;
  private readonly renameRetryDelayMs: number;
  private readonly closeHandle: (
    handle: FileHandle,
    kind: "temporary" | "lock",
  ) => Promise<void>;
  private readonly remove: (candidate: string) => Promise<void>;

  constructor(projectRoot: string, options: RunStoreOptions = {}) {
    const safeRoot = assertInsideProject(projectRoot);
    this.runsDirectory = path.join(safeRoot, "public", "runs");
    this.currentPath = path.join(this.runsDirectory, "current.json");
    this.lockPath = path.join(this.runsDirectory, ".current.lock");
    this.rename = options.rename ?? fsRename;
    this.renameRetryDelayMs = options.renameRetryDelayMs ?? 20;
    this.closeHandle =
      options.closeHandle ??
      ((handle: FileHandle) => handle.close());
    this.remove =
      options.remove ??
      ((candidate: string) => rm(candidate, { force: true }));
  }

  async read(): Promise<RunManifest | undefined> {
    if (!existsSync(this.runsDirectory)) return undefined;
    try {
      const currentPath = assertInsideProject(this.currentPath);
      return RunManifestSchema.parse(JSON.parse(await readFile(currentPath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async write(manifest: RunManifest, expectation?: RunStoreExpectation): Promise<void> {
    const validated = RunManifestSchema.parse(manifest);
    await ensureProjectDirectory(this.runsDirectory);

    const lockHandle = await this.acquireLock();
    let tempPath: string | undefined;
    let tempHandle: FileHandle | undefined;
    let primaryError: unknown;
    let actionFailed = false;
    const cleanupFailures: CleanupFailure[] = [];
    try {
      const current = await this.read();
      this.assertCompareAndSwap(current, validated, expectation);

      tempPath = assertInsideProject(
        path.join(
          this.runsDirectory,
          `.current.${process.pid}.${randomUUID()}.tmp`,
        ),
      );
      tempHandle = await open(tempPath, "wx", 0o600);
      try {
        await tempHandle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, "utf8");
        await tempHandle.sync();
      } catch (error) {
        actionFailed = true;
        primaryError = error;
      }

      const tempClosed = await attemptCleanup(
        cleanupFailures,
        "temporary manifest handle close",
        () => this.closeHandle(tempHandle as FileHandle, "temporary"),
      );
      tempHandle = undefined;

      if (!actionFailed && tempClosed) {
        await this.renameWithRetry(tempPath, assertInsideProject(this.currentPath));
        tempPath = undefined;
      }
    } catch (error) {
      if (!actionFailed) {
        actionFailed = true;
        primaryError = error;
      }
    }

    if (tempHandle) {
      await attemptCleanup(
        cleanupFailures,
        "temporary manifest handle close",
        () => this.closeHandle(tempHandle as FileHandle, "temporary"),
      );
    }
    if (tempPath) {
      await attemptCleanup(
        cleanupFailures,
        "temporary manifest removal",
        () => this.remove(tempPath as string),
      );
    }
    await attemptCleanup(cleanupFailures, "run-store lock handle close", () =>
      this.closeHandle(lockHandle, "lock"),
    );
    await attemptCleanup(cleanupFailures, "run-store lock removal", () =>
      this.remove(this.lockPath),
    );

    if (actionFailed) throw primaryError;
    if (cleanupFailures.length > 0) {
      throw cleanupAggregateError("RunStore", cleanupFailures);
    }
  }

  private assertCompareAndSwap(
    current: RunManifest | undefined,
    incoming: RunManifest,
    expectation: RunStoreExpectation | undefined,
  ): void {
    if (!current) {
      if (expectation) {
        throw new Error("Run manifest compare-and-swap failed: current manifest is absent.");
      }
      if (incoming.revision !== 0) {
        throw new Error("Run manifest compare-and-swap failed: an initial manifest requires revision 0.");
      }
      return;
    }

    if (
      !expectation ||
      current.runId !== expectation.runId ||
      current.revision !== expectation.revision ||
      current.status !== expectation.expectedStatus
    ) {
      throw new Error("Run manifest compare-and-swap failed: current identity, revision, or status changed.");
    }

    if (incoming.runId === current.runId && incoming.revision !== current.revision + 1) {
      throw new Error("Run manifest compare-and-swap failed: same-run updates must increment revision by one.");
    }
    if (incoming.runId !== current.runId && incoming.revision !== 0) {
      throw new Error("Run manifest compare-and-swap failed: replacement runs must begin at revision 0.");
    }
  }

  private async acquireLock() {
    const safeLockPath = assertInsideProject(this.lockPath);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        return await open(safeLockPath, "wx", 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 49) throw error;
        await delay(10);
      }
    }
    throw new Error("Unable to acquire run-store lock.");
  }

  private async renameWithRetry(from: string, to: string): Promise<void> {
    const attempts = process.platform === "win32" ? WINDOWS_RENAME_ATTEMPTS : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        await this.rename(from, to);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (
          attempt === attempts - 1 ||
          process.platform !== "win32" ||
          !code ||
          !WINDOWS_RETRYABLE_CODES.has(code)
        ) {
          throw error;
        }
        await delay(this.renameRetryDelayMs * (attempt + 1));
      }
    }
  }
}
