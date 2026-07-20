import { spawn } from "node:child_process";
import { readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../../tools/accesspatch/paths.js";

interface CliResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

const cliPath = path.join(PROJECT_ROOT, "tools", "accesspatch", "cli.ts");
const tsxPath = path.join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const checkoutPath = path.join(PROJECT_ROOT, "src", "checkout", "CheckoutPage.tsx");
const runsDirectory = path.join(PROJECT_ROOT, "public", "runs");
const currentPath = path.join(runsDirectory, "current.json");

function runCli(args: readonly string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxPath, cliPath, ...args], {
      cwd: PROJECT_ROOT,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

function runNodeScript(script: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(PROJECT_ROOT, script)], {
      cwd: PROJECT_ROOT,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function optionalFile(candidate: string): Promise<Buffer | undefined> {
  try {
    return await readFile(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

describe.sequential("AccessPatch CLI contract", () => {
  for (const args of [
    ["scan", "--help"],
    ["proposals", "write", "--help"],
    ["approval", "record", "--help"],
    ["verify", "--help"],
    ["reset-demo", "--help"],
    ["submission-check", "--help"],
  ] as const) {
    it(`supports accesspatch ${args.join(" ")}`, async () => {
      const result = await runCli(args);
      expect(result).toMatchObject({ exitCode: 0, signal: null, stderr: "" });
      expect(result.stdout).toMatch(/^Usage:/);
    });
  }

  it("prints machine-readable JSON for a successful command", async () => {
    const sourceBefore = await readFile(checkoutPath);
    try {
      const result = await runCli(["reset-demo"]);
      expect(result).toMatchObject({ exitCode: 0, signal: null, stderr: "" });
      expect(JSON.parse(result.stdout)).toMatchObject({
        source: "fixtures/broken-demo/CheckoutPage.tsx",
        target: "src/checkout/CheckoutPage.tsx",
      });
    } finally {
      await writeFile(checkoutPath, sourceBefore);
    }
  });

  it("returns non-zero and writes invalid workflow state errors only to stderr", async () => {
    const currentBefore = await optionalFile(currentPath);
    await mkdir(runsDirectory, { recursive: true });
    await rm(currentPath, { force: true });
    try {
      const result = await runCli([
        "approval",
        "record",
        "--decision",
        "approved",
        "--actor",
        "human",
        "--finding",
        "AP-EU-001",
      ]);
      expect(result.exitCode).not.toBe(0);
      expect(result.signal).toBeNull();
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/existing run manifest/i);
    } finally {
      if (currentBefore) {
        await writeFile(currentPath, currentBefore);
      } else {
        await rm(currentPath, { force: true });
      }
    }
  });

  it("prints deterministic no-login judge instructions without leaving a server", async () => {
    const result = await runNodeScript("scripts/judge.mjs");
    expect(result).toMatchObject({ exitCode: 0, signal: null, stderr: "" });
    expect(result.stdout).toContain(
      "Dashboard URL: http://127.0.0.1:4173/accesspatch",
    );
    expect(result.stdout).toContain(
      "Expected result: AccessPatch verification: PASS",
    );
    expect(result.stdout).toMatch(/no login.*no (?:OpenAI )?API key/is);
  });
});
