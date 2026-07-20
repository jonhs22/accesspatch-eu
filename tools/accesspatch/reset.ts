import { createHash } from "node:crypto";
import { copyFile, open, readFile, rm, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { attemptCleanup, cleanupAggregateError, type CleanupFailure } from "./cleanup.js";
import { PROJECT_ROOT } from "./paths.js";

export interface ResetOptions {
  copy?: (source: string, target: string) => Promise<void>;
  read?: (candidate: string) => Promise<Buffer>;
  closeHandle?: (handle: FileHandle) => Promise<void>;
  remove?: (candidate: string) => Promise<void>;
}
export interface ResetReceipt { sha256: string; source: "fixtures/broken-demo/CheckoutPage.tsx"; target: "src/checkout/CheckoutPage.tsx"; }
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Restores only the deliberately broken checkout fixture; no Git mutation is involved. */
export async function resetBrokenDemo(projectRoot = PROJECT_ROOT, options: ResetOptions = {}): Promise<ResetReceipt> {
  const root = path.resolve(projectRoot);
  const source = path.join(root, "fixtures", "broken-demo", "CheckoutPage.tsx");
  const target = path.join(root, "src", "checkout", "CheckoutPage.tsx");
  const lockPath = path.join(root, "public", "runs", ".fixture-reset.lock");
  const close = options.closeHandle ?? ((handle: FileHandle) => handle.close());
  const remove = options.remove ?? ((candidate: string) => rm(candidate, { force: true }));
  const copy = options.copy ?? ((from: string, to: string) => copyFile(from, to));
  const read = options.read ?? ((candidate: string) => readFile(candidate));
  const lock = await open(lockPath, "wx", 0o600);
  let result: ResetReceipt | undefined;
  let primary: unknown;
  try {
    const expected = hash(await read(source));
    await copy(source, target);
    const actual = hash(await read(target));
    if (actual !== expected) throw new Error("Reset target hash does not match the broken fixture.");
    result = { sha256: actual, source: "fixtures/broken-demo/CheckoutPage.tsx", target: "src/checkout/CheckoutPage.tsx" };
  } catch (error) { primary = error; }
  const cleanupFailures: CleanupFailure[] = [];
  await attemptCleanup(cleanupFailures, "reset lock handle close", () => close(lock));
  await attemptCleanup(cleanupFailures, "reset lock removal", () => remove(lockPath));
  if (primary) throw primary;
  if (cleanupFailures.length) throw cleanupAggregateError("Demo reset", cleanupFailures);
  return result as ResetReceipt;
}
