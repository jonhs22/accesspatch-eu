import { expect, test } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import {
  mkdir,
  readFile,
  readdir,
  rmdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { RunManifestSchema } from "../../src/contracts/run.js";
import { PROJECT_ROOT } from "../../tools/accesspatch/paths.js";
import { scan } from "../../tools/accesspatch/scanner.js";

const checkoutSource = path.join(PROJECT_ROOT, "src", "checkout", "CheckoutPage.tsx");
const runsDirectory = path.join(PROJECT_ROOT, "public", "runs");
const currentPath = path.join(runsDirectory, "current.json");

async function optionalFile(filePath: string): Promise<Buffer | undefined> {
  try {
    return await readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function zipTextEntries(archive: Buffer): string {
  let endOfCentralDirectory = archive.length - 22;
  while (
    endOfCentralDirectory >= 0 &&
    archive.readUInt32LE(endOfCentralDirectory) !== 0x06054b50
  ) {
    endOfCentralDirectory -= 1;
  }
  if (endOfCentralDirectory < 0) throw new Error("Trace archive has no central directory.");

  const entryCount = archive.readUInt16LE(endOfCentralDirectory + 10);
  let centralOffset = archive.readUInt32LE(endOfCentralDirectory + 16);
  const textEntries: string[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error("Invalid trace central-directory entry.");
    }
    const compression = archive.readUInt16LE(centralOffset + 10);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    const entry =
      compression === 0
        ? compressed
        : compression === 8
          ? inflateRawSync(compressed)
          : Buffer.alloc(0);
    textEntries.push(entry.toString("utf8"));
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return textEntries.join("\n");
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

test("baseline scan atomically publishes deterministic complete evidence", async () => {
  test.setTimeout(90_000);
  const runId = `scanner-e2e-${randomUUID()}`;
  const sourceBefore = await readFile(checkoutSource);
  const currentBefore = await optionalFile(currentPath);
  const runsExisted = await pathExists(runsDirectory);
  const runtimeDirectory = path.join(runsDirectory, "runtime");
  const runtimeExisted = await pathExists(runtimeDirectory);

  try {
    const manifest = await scan("before", {
      runId,
      runMode: "deterministic_fixture",
    });
    const parsed = RunManifestSchema.parse(manifest);

    expect(parsed.status).toBe("analyzing");
    expect(parsed.revision).toBe(1);
    expect(parsed.before?.findings.map(({ id }) => id)).toEqual([
      "AP-EU-001",
      "AP-EU-002",
      "AP-EU-003",
    ]);
    expect(parsed.before?.findings.map(({ sourceMarker }) => sourceMarker)).toEqual([
      "ACCESSPATCH-DEMO-001",
      "ACCESSPATCH-DEMO-002",
      "ACCESSPATCH-DEMO-003",
    ]);
    expect(parsed.before?.journeyChecks.some((check) => !check.passed)).toBe(true);
    expect(JSON.parse(await readFile(currentPath, "utf8"))).toEqual(parsed);
    expect((await readdir(runsDirectory)).filter((name) => /^\.current\..+\.tmp$/.test(name))).toEqual([]);

    const evidence = parsed.before;
    expect(evidence).toBeDefined();
    if (!evidence) throw new Error("Expected before evidence.");

    const artifactPaths = [
      evidence.screenshotPath,
      evidence.tracePath,
      evidence.domPath,
      evidence.ariaSnapshotPath,
      evidence.axeReportPath,
      evidence.keyboardTracePath,
    ];
    for (const artifactPath of artifactPaths) {
      expect(artifactPath.startsWith(`public/runs/runtime/${runId}/before/`)).toBe(true);
      expect((await stat(path.join(PROJECT_ROOT, artifactPath))).size).toBeGreaterThan(0);
    }

    const dom = await readFile(path.join(PROJECT_ROOT, evidence.domPath), "utf8");
    expect(dom).not.toContain("alex.example.com");
    expect(dom).not.toMatch(/<script\b/i);

    const aria = await readFile(path.join(PROJECT_ROOT, evidence.ariaSnapshotPath), "utf8");
    expect(aria).toContain("Complete your order");

    const axe = JSON.parse(await readFile(path.join(PROJECT_ROOT, evidence.axeReportPath), "utf8")) as {
      violations: Array<{ id: string; nodes: Array<{ target: string[] }> }>;
    };
    expect(axe.violations.map(({ id }) => id)).toEqual(
      [...axe.violations.map(({ id }) => id)].sort(),
    );
    expect(axe.violations.some(({ id }) => id === "button-name")).toBe(true);

    const keyboard = JSON.parse(
      await readFile(path.join(PROJECT_ROOT, evidence.keyboardTracePath), "utf8"),
    ) as {
      environment: {
        viewport: { width: number; height: number };
        deviceScaleFactor: number;
        locale: string;
        reducedMotion: string;
      };
      steps: Array<{ key: string; target: { testId: string | null } }>;
      repeatedFocusTargets: string[];
      visibleErrorIsLive: boolean;
      blockedExternalRequests: string[];
      privacy: {
        redactedFormControlCount: number;
        formControlsRedacted: boolean;
      };
    };
    expect(keyboard.environment).toEqual({
      viewport: { width: 1672, height: 941 },
      deviceScaleFactor: 1,
      locale: "en",
      reducedMotion: "reduce",
    });
    expect(keyboard.steps.map(({ key }) => key)).toEqual([
      "Enter",
      "Tab",
      "Tab",
      "Tab",
      "Tab",
      "Tab",
      "Tab",
    ]);
    expect(keyboard.repeatedFocusTargets).toEqual(["email", "email", "email", "email", "email"]);
    expect(keyboard.visibleErrorIsLive).toBe(false);
    expect(keyboard.blockedExternalRequests).toEqual([]);
    expect(keyboard.privacy.formControlsRedacted).toBe(true);
    expect(keyboard.privacy.redactedFormControlCount).toBeGreaterThan(0);

    const traceText = zipTextEntries(
      await readFile(path.join(PROJECT_ROOT, evidence.tracePath)),
    );
    expect(traceText).toMatch(/page\.goto|frame\.goto|\"method\":\"goto\"/);
    const inspectableArtifacts = [
      dom,
      aria,
      JSON.stringify(axe),
      JSON.stringify(keyboard),
      traceText,
    ];
    for (const artifact of inspectableArtifacts) {
      expect(artifact).not.toContain("alex.example.com");
    }
  } finally {
    expect(sha256(await readFile(checkoutSource))).toBe(sha256(sourceBefore));
    await rm(path.join(runtimeDirectory, runId), { recursive: true, force: true });
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
