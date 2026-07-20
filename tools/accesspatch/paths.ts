import {
  existsSync,
  realpathSync,
} from "node:fs";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(currentDirectory, "../..");
const REAL_PROJECT_ROOT = realpathSync.native(PROJECT_ROOT);

function normalizeForComparison(candidate: string): string {
  return process.platform === "win32" ? candidate.toLowerCase() : candidate;
}

function ensureContained(realCandidate: string, original: string): void {
  const normalizedRoot = normalizeForComparison(REAL_PROJECT_ROOT);
  const normalizedCandidate = normalizeForComparison(realCandidate);
  if (
    normalizedCandidate !== normalizedRoot &&
    !normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    throw new Error(`Path is outside project root: ${original}`);
  }
}

export function assertInsideProject(candidate: string): string {
  const resolvedCandidate = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(PROJECT_ROOT, candidate);
  ensureContained(resolvedCandidate, candidate);

  if (existsSync(resolvedCandidate)) {
    const realCandidate = realpathSync.native(resolvedCandidate);
    ensureContained(realCandidate, candidate);
    return realCandidate;
  }

  const parent = path.dirname(resolvedCandidate);
  if (!existsSync(parent)) {
    throw new Error(`Parent directory does not exist for project output: ${candidate}`);
  }
  const realParent = realpathSync.native(parent);
  ensureContained(realParent, candidate);
  return path.join(realParent, path.basename(resolvedCandidate));
}

export async function assertInsideProjectAsync(candidate: string): Promise<string> {
  const resolvedCandidate = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(PROJECT_ROOT, candidate);
  ensureContained(resolvedCandidate, candidate);

  try {
    const realCandidate = await realpath(resolvedCandidate);
    ensureContained(realCandidate, candidate);
    return realCandidate;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const realParent = await realpath(path.dirname(resolvedCandidate));
  ensureContained(realParent, candidate);
  return path.join(realParent, path.basename(resolvedCandidate));
}

export function assertSafeGitPath(candidate: string): string {
  const segments = candidate.split("/");
  const unsafe =
    candidate.length === 0 ||
    candidate.includes("\0") ||
    candidate.includes("\\") ||
    candidate.includes(":") ||
    candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /^[A-Za-z]:/.test(candidate) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..");

  if (unsafe) {
    throw new Error(`Unsafe Git path: ${candidate}`);
  }
  return candidate;
}
