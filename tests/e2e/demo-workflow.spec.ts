import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { RunManifestSchema, type RunManifest } from "../../src/contracts/run.js";
import { PROJECT_ROOT } from "../../tools/accesspatch/paths.js";

interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

const checkoutPath = path.join(PROJECT_ROOT, "src", "checkout", "CheckoutPage.tsx");
const runsDirectory = path.join(PROJECT_ROOT, "public", "runs");
const runtimeDirectory = path.join(runsDirectory, "runtime");
const currentPath = path.join(runsDirectory, "current.json");
const fixtureLockPath = path.join(runsDirectory, ".fixture-reset.lock");
const storeLockPath = path.join(runsDirectory, ".current.lock");

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function optionalFile(candidate: string): Promise<Buffer | undefined> {
  try {
    return await readFile(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function runDemo(): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NO_COLOR;
    delete env.FORCE_COLOR;
    const child = spawn(
      process.execPath,
      [path.join(PROJECT_ROOT, "scripts", "demo-verify.mjs")],
      {
        cwd: PROJECT_ROOT,
        env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, 100_000);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timeout);
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

test("deterministic fixture workflow passes and restores exact source bytes", async () => {
  test.setTimeout(120_000);
  const sourceBefore = await readFile(checkoutPath);
  const sourceHashBefore = sha256(sourceBefore);
  const currentBefore = await optionalFile(currentPath);
  const runsExisted = await pathExists(runsDirectory);
  const runtimeExisted = await pathExists(runtimeDirectory);
  let manifest: RunManifest | undefined;

  try {
    const result = await runDemo();
    expect(result).toMatchObject({ exitCode: 0, signal: null, stderr: "" });
    expect(result.stdout.trimEnd().endsWith("AccessPatch verification: PASS")).toBe(true);

    manifest = RunManifestSchema.parse(
      JSON.parse(await readFile(currentPath, "utf8")),
    );
    expect(manifest).toMatchObject({
      runMode: "deterministic_fixture",
      status: "passed",
      approval: {
        decision: "approved",
        actor: "test_fixture",
      },
      verification: {
        outcome: "passed",
        resolvedFindingIds: ["AP-EU-001", "AP-EU-002", "AP-EU-003"],
        remainingFindingIds: [],
        regressions: [],
        checkoutCompleted: true,
        changedFiles: ["src/checkout/CheckoutPage.tsx"],
        diffWithinAllowlist: true,
      },
    });
    expect(manifest.verification?.diffPath).toBe(
      `public/runs/runtime/${manifest.runId}/verification/diff.patch`,
    );
    expect(
      (await stat(path.join(PROJECT_ROOT, manifest.verification!.diffPath))).size,
    ).toBeGreaterThan(0);
    expect(sha256(await readFile(checkoutPath))).toBe(sourceHashBefore);
    expect(await pathExists(fixtureLockPath)).toBe(false);
    expect(await pathExists(storeLockPath)).toBe(false);
  } finally {
    if (!manifest) {
      const generatedCurrent = await optionalFile(currentPath);
      if (generatedCurrent) {
        const candidate = RunManifestSchema.safeParse(
          JSON.parse(generatedCurrent.toString("utf8")),
        );
        if (
          candidate.success &&
          candidate.data.runMode === "deterministic_fixture" &&
          candidate.data.runId.startsWith("demo-")
        ) {
          manifest = candidate.data;
        }
      }
    }
    const sourceAfter = await readFile(checkoutPath);
    if (!sourceAfter.equals(sourceBefore)) {
      await writeFile(checkoutPath, sourceBefore);
    }
    if (manifest) {
      await rm(path.join(runtimeDirectory, manifest.runId), {
        recursive: true,
        force: true,
      });
    }
    if (currentBefore) {
      await mkdir(runsDirectory, { recursive: true });
      await writeFile(currentPath, currentBefore);
    } else {
      await rm(currentPath, { force: true });
    }
    if (!runtimeExisted) {
      await rmdir(runtimeDirectory).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
      });
    }
    if (!runsExisted) {
      await rmdir(runsDirectory).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
      });
    }
  }
});
