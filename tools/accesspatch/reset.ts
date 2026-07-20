import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename as fsRename,
  rm,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import {
  attemptCleanup,
  cleanupAggregateError,
  type CleanupFailure,
} from "./cleanup.js";
import { PROJECT_ROOT } from "./paths.js";

export interface ResetOptions {
  read?: (candidate: string) => Promise<Buffer>;
  writeTemporary?: (handle: FileHandle, bytes: Buffer) => Promise<void>;
  rename?: (from: string, to: string) => Promise<void>;
  closeHandle?: (handle: FileHandle) => Promise<void>;
  remove?: (candidate: string) => Promise<void>;
}

export interface ResetReceipt {
  sha256: string;
  source: "fixtures/broken-demo/CheckoutPage.tsx";
  target: "src/checkout/CheckoutPage.tsx";
}

const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

/** Restores only the deliberately broken checkout fixture; no Git mutation is involved. */
export async function resetBrokenDemo(
  projectRoot = PROJECT_ROOT,
  options: ResetOptions = {},
): Promise<ResetReceipt> {
  const root = path.resolve(projectRoot);
  const source = path.join(
    root,
    "fixtures",
    "broken-demo",
    "CheckoutPage.tsx",
  );
  const target = path.join(root, "src", "checkout", "CheckoutPage.tsx");
  const runsDirectory = path.join(root, "public", "runs");
  const lockPath = path.join(runsDirectory, ".fixture-reset.lock");
  const temporaryPath = path.join(
    path.dirname(target),
    `.CheckoutPage.tsx.reset.${process.pid}.${randomUUID()}.tmp`,
  );

  const read = options.read ?? ((candidate: string) => readFile(candidate));
  const writeTemporary =
    options.writeTemporary ??
    ((handle: FileHandle, bytes: Buffer) => handle.writeFile(bytes));
  const rename = options.rename ?? fsRename;
  const close =
    options.closeHandle ?? ((handle: FileHandle) => handle.close());
  const remove =
    options.remove ?? ((candidate: string) => rm(candidate, { force: true }));

  await mkdir(runsDirectory, { recursive: true });
  const lockHandle = await open(lockPath, "wx", 0o600);
  let temporaryHandle: FileHandle | undefined;
  let temporaryExists = false;
  let result: ResetReceipt | undefined;
  let primaryError: unknown;

  try {
    const sourceBytes = await read(source);
    const sourceHash = hash(sourceBytes);

    temporaryHandle = await open(temporaryPath, "wx", 0o600);
    temporaryExists = true;
    await writeTemporary(temporaryHandle, sourceBytes);
    await temporaryHandle.sync();
    await close(temporaryHandle);
    temporaryHandle = undefined;

    if (hash(await read(temporaryPath)) !== sourceHash) {
      throw new Error(
        "Reset temporary file hash does not match the broken fixture.",
      );
    }

    await rename(temporaryPath, target);
    temporaryExists = false;
    result = {
      sha256: sourceHash,
      source: "fixtures/broken-demo/CheckoutPage.tsx",
      target: "src/checkout/CheckoutPage.tsx",
    };
  } catch (error) {
    primaryError = error;
  }

  const cleanupFailures: CleanupFailure[] = [];
  if (temporaryHandle) {
    await attemptCleanup(
      cleanupFailures,
      "reset temporary handle close",
      () => close(temporaryHandle as FileHandle),
    );
  }
  if (temporaryExists) {
    await attemptCleanup(
      cleanupFailures,
      "reset temporary file removal",
      () => remove(temporaryPath),
    );
  }
  await attemptCleanup(cleanupFailures, "reset lock handle close", () =>
    close(lockHandle),
  );
  await attemptCleanup(cleanupFailures, "reset lock removal", () =>
    remove(lockPath),
  );

  if (primaryError) throw primaryError;
  if (cleanupFailures.length) {
    throw cleanupAggregateError("Demo reset", cleanupFailures);
  }
  return result as ResetReceipt;
}
