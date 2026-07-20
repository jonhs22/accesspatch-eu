import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(currentDirectory, "../..");

export function assertInsideProject(candidate: string): string {
  const resolvedCandidate = path.resolve(candidate);
  const normalizedRoot = process.platform === "win32" ? PROJECT_ROOT.toLowerCase() : PROJECT_ROOT;
  const normalizedCandidate = process.platform === "win32" ? resolvedCandidate.toLowerCase() : resolvedCandidate;

  if (normalizedCandidate !== normalizedRoot && !normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Path is outside project root: ${candidate}`);
  }

  return resolvedCandidate;
}
