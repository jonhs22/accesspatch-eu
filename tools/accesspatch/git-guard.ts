import { spawn } from "node:child_process";
import { PROJECT_ROOT } from "./paths.js";

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal?: NodeJS.Signals | null;
}

export interface GitCommandRunner {
  run(args: readonly string[]): Promise<GitCommandResult>;
}

export class SpawnGitRunner implements GitCommandRunner {
  constructor(private readonly projectRoot = PROJECT_ROOT) {}

  run(args: readonly string[]): Promise<GitCommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", ["-C", this.projectRoot, ...args], {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
      child.once("error", reject);
      child.once("close", (exitCode, signal) => resolve({
        stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), exitCode, signal,
      }));
    });
  }
}

function failed(command: string, result: GitCommandResult): Error {
  const signal = result.signal ? ` (signal ${result.signal})` : "";
  return new Error(`Git ${command} failed with exit ${result.exitCode ?? "unknown"}${signal}: ${result.stderr.trim()}`);
}

async function successful(runner: GitCommandRunner, args: readonly string[]): Promise<string> {
  const result = await runner.run(args);
  if (result.exitCode !== 0) throw failed(args.join(" "), result);
  return result.stdout;
}

export function normalizeGitPath(candidate: string): string {
  if (
    candidate.length === 0 || candidate.includes("\0") || candidate.includes("\\") || candidate.includes(":") ||
    candidate.startsWith("/") || candidate.startsWith("//") || /^[A-Za-z]:/.test(candidate) ||
    candidate.split("/").some((part) => part === "" || part === "." || part === "..")
  ) throw new Error(`Unsafe Git path: ${candidate}`);
  return candidate;
}

export function changedFilesFromNameStatus(output: string): string[] {
  const fields = output.split("\0");
  const files: string[] = [];
  for (let index = 0; index < fields.length - 1;) {
    const status = fields[index++];
    if (!status) continue;
    const requiresTwoPaths = /^[RC]/.test(status);
    const paths = fields.slice(index, index + (requiresTwoPaths ? 2 : 1));
    if (paths.length !== (requiresTwoPaths ? 2 : 1) || paths.some((value) => !value)) {
      throw new Error("Malformed NUL-delimited git name-status output.");
    }
    files.push(...paths.map(normalizeGitPath));
    index += paths.length;
  }
  return [...new Set(files)].sort();
}

export async function assertCleanInteractiveWorktree(
  run: { runMode: "interactive" | "deterministic_fixture" },
  runner: GitCommandRunner = new SpawnGitRunner(),
): Promise<void> {
  if (run.runMode !== "interactive") return;
  const status = await successful(runner, ["status", "--porcelain=v1", "-z"]);
  if (status.length > 0) throw new Error("Interactive runs require a clean worktree.");
}

export async function currentHead(runner: GitCommandRunner = new SpawnGitRunner()): Promise<string> {
  const head = (await successful(runner, ["rev-parse", "HEAD"])).trim();
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error("Git HEAD is not a full SHA-1 commit.");
  return head;
}

export async function assertHeadUnchanged(baselineCommit: string, runner: GitCommandRunner = new SpawnGitRunner()): Promise<void> {
  if (await currentHead(runner) !== baselineCommit) throw new Error("Git HEAD changed after the run baseline was captured.");
}

export async function changedFilesSince(
  baselineCommit: string,
  runner: GitCommandRunner = new SpawnGitRunner(),
): Promise<string[]> {
  return changedFilesFromNameStatus(await successful(runner, ["diff", "--name-status", "-z", baselineCommit, "--"]));
}

const DISALLOWED_PRODUCT_ROOTS = ["tests/", "tools/", "fixtures/", "public/", ".superpowers/"];
export function validateProductPatch(changedFiles: readonly string[], approvedCandidates: readonly string[]) {
  const approved = new Set(approvedCandidates.map(normalizeGitPath));
  const normalized = [...new Set(changedFiles.map(normalizeGitPath))].sort();
  const rejectedPaths = normalized.filter((file) =>
    !file.startsWith("src/checkout/") || DISALLOWED_PRODUCT_ROOTS.some((root) => file.startsWith(root)) || !approved.has(file),
  );
  return { changedFiles: normalized, withinAllowlist: rejectedPaths.length === 0, rejectedPaths };
}
