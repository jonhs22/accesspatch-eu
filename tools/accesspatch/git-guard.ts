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

function nulRecords(output: string, label: string): string[] {
  if (output === "") return [];
  if (!output.endsWith("\0")) {
    throw new Error(`Malformed NUL-delimited ${label}: missing final NUL.`);
  }
  const records = output.split("\0");
  records.pop();
  if (records.some((record) => record.length === 0)) {
    throw new Error(`Malformed NUL-delimited ${label}: empty record.`);
  }
  return records;
}

function pathCountForStatus(status: string): number {
  if (/^[ADMTUB]$/.test(status)) return 1;
  const similarity = /^([RC])([0-9]{1,3})$/.exec(status);
  if (similarity && Number(similarity[2]) <= 100) return 2;
  throw new Error(`Unknown or malformed Git name-status value: ${status}.`);
}

export function changedFilesFromNameStatus(output: string): string[] {
  const fields = nulRecords(output, "git name-status output");
  const files: string[] = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const pathCount = pathCountForStatus(status);
    const paths = fields.slice(index, index + pathCount);
    if (paths.length !== pathCount) {
      throw new Error("Malformed NUL-delimited git name-status output.");
    }
    files.push(...paths.map(normalizeGitPath));
    index += pathCount;
  }
  return [...new Set(files)].sort();
}

function changedFilesFromNulPaths(output: string): string[] {
  return nulRecords(output, "untracked Git path output").map(normalizeGitPath);
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
  const tracked = await successful(runner, [
    "diff",
    "--name-status",
    "-z",
    baselineCommit,
    "--",
  ]);
  const untracked = await successful(runner, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
  ]);
  return [
    ...new Set([
      ...changedFilesFromNameStatus(tracked),
      ...changedFilesFromNulPaths(untracked),
    ]),
  ].sort();
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
