import { Command, Option } from "commander";
import { open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FindingIdSchema,
  FixProposalSchema,
  RunManifestSchema,
  type RunManifest,
} from "../../src/contracts/run.js";
import { recordApproval } from "./approval.js";
import { loadConfig } from "./config.js";
import {
  SpawnGitRunner,
  assertHeadUnchanged,
  changedFilesFromNameStatus,
  changedFilesSince,
} from "./git-guard.js";
import {
  PROJECT_ROOT,
  assertInsideProject,
  assertSafeGitPath,
  ensureProjectDirectory,
} from "./paths.js";
import { writeProposals } from "./proposals.js";
import { resetBrokenDemo } from "./reset.js";
import { RunStore } from "./run-store.js";
import { verify as verifyEvidence } from "./verifier.js";

interface ScanCommandOptions {
  phase: "before" | "after";
  runMode: "interactive" | "deterministic_fixture";
  runId?: string;
}

interface ApprovalCommandOptions {
  decision: "approved" | "rejected";
  actor?: "human" | "test_fixture";
  finding: string[];
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

async function prepareProject(): Promise<void> {
  assertInsideProject(PROJECT_ROOT);
  if (!samePath(process.cwd(), PROJECT_ROOT)) {
    throw new Error(`AccessPatch CLI must run from the project root: ${PROJECT_ROOT}`);
  }
  await loadConfig();
  await ensureProjectDirectory(path.join(PROJECT_ROOT, "public", "runs"));
}

async function requireCurrent(
  store: RunStore,
  command: string,
): Promise<RunManifest> {
  const current = await store.read();
  if (!current) throw new Error(`${command} requires an existing run manifest.`);
  return current;
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function readProposalInput(input: string) {
  const trimmed = input.trim();
  const serialized =
    trimmed.startsWith("[") || trimmed.startsWith("{")
      ? trimmed
      : await readFile(assertInsideProject(input), "utf8");
  return FixProposalSchema.array().parse(JSON.parse(serialized));
}

async function successfulGit(
  runner: SpawnGitRunner,
  args: readonly string[],
): Promise<string> {
  const result = await runner.run(args);
  if (result.exitCode !== 0) {
    const signal = result.signal ? ` (signal ${result.signal})` : "";
    throw new Error(
      `Git ${args.join(" ")} failed with exit ${result.exitCode ?? "unknown"}${signal}: ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

function approvedCandidateFiles(manifest: RunManifest): string[] {
  if (!manifest.proposals) {
    throw new Error("Verification requires recorded proposals.");
  }
  return [
    ...new Set(
      manifest.proposals.flatMap(({ candidateFiles }) => candidateFiles),
    ),
  ].sort();
}

async function verificationChangedFiles(
  manifest: RunManifest,
  candidates: readonly string[],
  runner: SpawnGitRunner,
): Promise<string[]> {
  if (manifest.runMode === "interactive") {
    await assertHeadUnchanged(manifest.baselineCommit, runner);
    return changedFilesSince(manifest.baselineCommit, runner);
  }
  const output = await successfulGit(runner, [
    "diff",
    "--name-status",
    "-z",
    manifest.baselineCommit,
    "--",
    ...candidates,
  ]);
  return changedFilesFromNameStatus(output);
}

async function writeDiffArtifact(
  manifest: RunManifest,
  candidates: readonly string[],
  runner: SpawnGitRunner,
): Promise<string> {
  const relativePath = assertSafeGitPath(
    `public/runs/runtime/${manifest.runId}/verification/diff.patch`,
  );
  const directory = assertInsideProject(
    path.join(PROJECT_ROOT, path.dirname(relativePath)),
  );
  await ensureProjectDirectory(directory);
  const absolutePath = assertInsideProject(path.join(PROJECT_ROOT, relativePath));
  const pathScope =
    manifest.runMode === "deterministic_fixture" ? candidates : [];
  const diff = await successfulGit(runner, [
    "diff",
    "--binary",
    "--no-color",
    "--no-ext-diff",
    manifest.baselineCommit,
    "--",
    ...pathScope,
  ]);

  const handle = await open(absolutePath, "wx", 0o600);
  let complete = false;
  try {
    await handle.writeFile(diff, "utf8");
    await handle.sync();
    complete = true;
  } finally {
    await handle.close();
    if (!complete) await rm(absolutePath, { force: true });
  }
  return relativePath;
}

async function runSubmissionCheck(): Promise<unknown> {
  const moduleSpecifier = "./submission-check.js";
  let module: Record<string, unknown>;
  try {
    module = (await import(moduleSpecifier)) as Record<string, unknown>;
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" &&
      String((error as Error).message).includes("submission-check")
    ) {
      throw new Error(
        "Submission validation is unavailable until tools/accesspatch/submission-check.ts is installed.",
      );
    }
    throw error;
  }
  const checker =
    module.runSubmissionCheck ?? module.submissionCheck ?? module.default;
  if (typeof checker !== "function") {
    throw new Error(
      "Submission validator must export runSubmissionCheck, submissionCheck, or a default function.",
    );
  }
  return checker(PROJECT_ROOT);
}

export function createProgram(): Command {
  const program = new Command()
    .name("accesspatch")
    .description("Evidence-backed accessibility repair and verification workflow.")
    .showHelpAfterError()
    .showSuggestionAfterError();

  program
    .command("scan")
    .description("Capture before or after accessibility evidence.")
    .addOption(new Option("--phase <phase>", "Evidence phase.").choices(["before", "after"]).makeOptionMandatory())
    .addOption(new Option("--run-mode <mode>", "Run provenance.").choices(["interactive", "deterministic_fixture"]).default("interactive"))
    .option("--run-id <run-id>", "Optional stable run identifier.")
    .action(async (options: ScanCommandOptions) => {
      await prepareProject();
      const { scan } = await import("./scanner.js");
      const result =
        options.phase === "before"
          ? await scan("before", {
              runId: options.runId,
              runMode: options.runMode,
            })
          : await scan("after");
      writeJson(result);
    });

  program
    .command("proposals")
    .description("Manage evidence-backed repair proposals.")
    .command("write")
    .description("Record one proposal per baseline finding.")
    .requiredOption("--input <json-or-path>", "Proposal JSON or a project-local JSON file.")
    .action(async (options: { input: string }) => {
      await prepareProject();
      const store = new RunStore(PROJECT_ROOT);
      const current = await requireCurrent(store, "Proposals");
      const next = writeProposals(
        current,
        await readProposalInput(options.input),
      );
      await store.write(next, {
        runId: current.runId,
        revision: current.revision,
        expectedStatus: current.status,
      });
      writeJson(next);
    });

  program
    .command("approval")
    .description("Manage the explicit repair approval gate.")
    .command("record")
    .description("Record an approval or rejection.")
    .addOption(new Option("--decision <decision>", "Approval decision.").choices(["approved", "rejected"]).default("approved"))
    .addOption(new Option("--actor <actor>", "Approval provenance.").choices(["human", "test_fixture"]))
    .option("--finding <finding-id>", "Finding identity; repeat for multiple findings.", (value, previous: string[]) => [...previous, value], [])
    .action(async (options: ApprovalCommandOptions) => {
      await prepareProject();
      const store = new RunStore(PROJECT_ROOT);
      const current = await requireCurrent(store, "Approval");
      const actor =
        options.actor ??
        (current.runMode === "interactive" ? "human" : "test_fixture");
      const findingIds = FindingIdSchema.array().parse(options.finding);
      const next = recordApproval(current, {
        decision: options.decision,
        actor,
        findingIds,
      });
      await store.write(next, {
        runId: current.runId,
        revision: current.revision,
        expectedStatus: current.status,
      });
      writeJson(next);
    });

  program
    .command("verify")
    .description("Verify the approved patch against before and after evidence.")
    .action(async () => {
      await prepareProject();
      const store = new RunStore(PROJECT_ROOT);
      const current = await requireCurrent(store, "Verification");
      if (current.status !== "verifying") {
        throw new Error(
          `Verification requires verifying status, received ${current.status}.`,
        );
      }
      if (!current.before || !current.after) {
        throw new Error("Verification requires complete before and after evidence.");
      }

      const candidates = approvedCandidateFiles(current);
      const runner = new SpawnGitRunner(PROJECT_ROOT);
      const changedFiles = await verificationChangedFiles(
        current,
        candidates,
        runner,
      );
      if (current.runMode === "interactive") {
        await assertHeadUnchanged(current.baselineCommit, runner);
      }
      const diffPath = await writeDiffArtifact(current, candidates, runner);
      if (current.runMode === "interactive") {
        await assertHeadUnchanged(current.baselineCommit, runner);
      }
      const verification = verifyEvidence(current.before, current.after, {
        changedFiles,
        approvedCandidateFiles: candidates,
        diffPath,
      });
      const updatedAt = new Date().toISOString();
      const terminal = RunManifestSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: verification.outcome,
        updatedAt,
        verification,
      });
      await store.write(terminal, {
        runId: current.runId,
        revision: current.revision,
        expectedStatus: "verifying",
      });
      if (verification.outcome !== "passed") {
        throw new Error(
          `AccessPatch verification failed: ${verification.failureReasons.join(" ")}`,
        );
      }
      writeJson(terminal);
    });

  program
    .command("reset-demo")
    .description("Restore the deliberately broken checkout fixture.")
    .action(async () => {
      await prepareProject();
      writeJson(await resetBrokenDemo(PROJECT_ROOT));
    });

  program
    .command("submission-check")
    .description("Validate the local submission package.")
    .action(async () => {
      await prepareProject();
      writeJson(await runSubmissionCheck());
    });

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  samePath(fileURLToPath(import.meta.url), process.argv[1]);

if (isEntryPoint) {
  main(process.argv).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
