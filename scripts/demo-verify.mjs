import "tsx/esm";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { startServer } from "./start-server.mjs";

const { RunManifestSchema } = await import("../src/contracts/run.ts");
const { main: runAccessPatch } = await import("../tools/accesspatch/cli.ts");
const { withFixtureLock } = await import(
  "../tools/accesspatch/fixture-lock.ts"
);
const { PROJECT_ROOT } = await import("../tools/accesspatch/paths.ts");
const { RunStore } = await import("../tools/accesspatch/run-store.ts");

const checkoutPath = path.join(
  PROJECT_ROOT,
  "src",
  "checkout",
  "CheckoutPage.tsx",
);
const repairedFixturePath = path.join(
  PROJECT_ROOT,
  "fixtures",
  "repaired-demo",
  "CheckoutPage.tsx",
);

let receivedSignal;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function throwIfInterrupted() {
  if (receivedSignal) {
    throw new Error(`Deterministic demo interrupted by ${receivedSignal}.`);
  }
}

async function cli(args) {
  throwIfInterrupted();
  await runAccessPatch([process.execPath, "accesspatch", ...args]);
  throwIfInterrupted();
}

async function currentManifest(expectedStatus) {
  const current = await new RunStore(PROJECT_ROOT).read();
  if (!current) throw new Error("Deterministic demo expected a current run.");
  const parsed = RunManifestSchema.parse(current);
  if (parsed.status !== expectedStatus) {
    throw new Error(
      `Deterministic demo expected ${expectedStatus}, received ${parsed.status}.`,
    );
  }
  return parsed;
}

function deterministicProposals(manifest) {
  if (!manifest.before) {
    throw new Error("Deterministic proposals require baseline evidence.");
  }
  return manifest.before.findings.map((finding) => ({
    findingId: finding.id,
    diagnosis: `Deterministic fixture diagnosis for ${finding.id}: ${finding.userImpact}`,
    proposedChange: `Apply the frozen repaired checkout behavior for ${finding.id}.`,
    candidateFiles: ["src/checkout/CheckoutPage.tsx"],
  }));
}

async function installRepairedFixture() {
  await withFixtureLock(async () => {
    const expected = await readFile(repairedFixturePath);
    await copyFile(repairedFixturePath, checkoutPath);
    const actual = await readFile(checkoutPath);
    if (sha256(actual) !== sha256(expected)) {
      throw new Error("Repaired fixture copy failed its exact-byte hash check.");
    }
  });
}

async function restoreOriginalSource(originalBytes, originalHash) {
  await withFixtureLock(async () => {
    await writeFile(checkoutPath, originalBytes);
    const restored = await readFile(checkoutPath);
    if (sha256(restored) !== originalHash) {
      throw new Error("Checkout source restore failed its exact-byte hash check.");
    }
  });
}

async function executeDemo() {
  const originalBytes = await readFile(checkoutPath);
  const originalHash = sha256(originalBytes);
  const abortController = new AbortController();
  const interrupt = (signal) => {
    if (receivedSignal) return;
    receivedSignal = signal;
    abortController.abort(
      new Error(`Deterministic demo interrupted by ${signal}.`),
    );
  };
  const onSigint = () => interrupt("SIGINT");
  const onSigterm = () => interrupt("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  let server;
  let primaryError;
  try {
    await cli(["reset-demo"]);
    server = await startServer({ signal: abortController.signal });
    throwIfInterrupted();

    const runId = `demo-${new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 14)}-${randomUUID().slice(0, 8)}`;
    await cli([
      "scan",
      "--phase",
      "before",
      "--run-mode",
      "deterministic_fixture",
      "--run-id",
      runId,
    ]);
    const analyzing = await currentManifest("analyzing");
    const proposals = deterministicProposals(analyzing);

    await cli([
      "proposals",
      "write",
      "--input",
      JSON.stringify(proposals),
    ]);
    await currentManifest("awaiting_approval");

    await cli([
      "approval",
      "record",
      "--decision",
      "approved",
      "--actor",
      "test_fixture",
      ...analyzing.before.findings.flatMap(({ id }) => ["--finding", id]),
    ]);
    await currentManifest("patching");

    await installRepairedFixture();
    await cli(["scan", "--phase", "after"]);
    await currentManifest("verifying");
    await cli(["verify"]);

    const passed = await currentManifest("passed");
    if (
      passed.runMode !== "deterministic_fixture" ||
      passed.approval?.actor !== "test_fixture" ||
      passed.verification?.outcome !== "passed"
    ) {
      throw new Error(
        "Deterministic demo produced an untruthful provenance or verification receipt.",
      );
    }
    throwIfInterrupted();
    process.stdout.write("AccessPatch verification: PASS\n");
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = [];
  try {
    await restoreOriginalSource(originalBytes, originalHash);
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await server?.stop();
  } catch (error) {
    cleanupErrors.push(error);
  }
  process.removeListener("SIGINT", onSigint);
  process.removeListener("SIGTERM", onSigterm);

  if (primaryError && cleanupErrors.length > 0) {
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      "Deterministic demo failed and cleanup also failed.",
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Deterministic demo cleanup failed.");
  }
}

executeDemo().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode =
    receivedSignal === "SIGINT" ? 130 : receivedSignal === "SIGTERM" ? 143 : 1;
});
