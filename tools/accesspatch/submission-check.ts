import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  readFile,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "./paths.js";

const REQUIRED_TEXT_ARTIFACTS = [
  "README.md",
  "docs/architecture.md",
  "docs/testing.md",
  "docs/CODEX_COLLABORATION.md",
  "SECURITY.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "assets/ASSET_LEDGER.md",
  "submission/DEVPOST.md",
  "submission/DEMO_SCRIPT.md",
  "submission/DEMO_TRANSCRIPT.md",
  "submission/DEMO_CAPTIONS.srt",
  "submission/SUBMISSION_CHECKLIST.md",
  "submission/TEST_CREDENTIALS.md",
] as const;

const REQUIRED_IMAGES = [
  ["submission/screenshots/01-blocked-keyboard-checkout.png", 1920, 1080],
  ["submission/screenshots/02-evidence-pack.png", 1920, 1080],
  ["submission/screenshots/03-approved-source-diff.png", 1920, 1080],
  ["submission/screenshots/04-verified-before-after.png", 1920, 1080],
  ["submission/accesspatch-eu-thumbnail-1280x720.png", 1280, 720],
] as const;

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".srt",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  "dist",
  "node_modules",
  "runtime",
  "test-results",
]);
const UNFINISHED_COPY = /\b(?:TODO|TBD|FIXME)\b|lorem ipsum|coming soon/i;

interface VideoProbe {
  format?: { duration?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    pix_fmt?: string;
    r_frame_rate?: string;
    channels?: number;
  }>;
}

export interface SubmissionCheckOptions {
  probeVideo?: (videoPath: string) => Promise<unknown>;
}

export function parseExternalHandoffs(checklist: string): string[] {
  const lines = checklist.split(/\r?\n/);
  const sectionStart = lines.findIndex((line) =>
    /^##\s+External account handoff\s*$/i.test(line),
  );
  if (sectionStart < 0) return [];

  const handoffs: string[] = [];
  let current: string[] | null = null;
  const finishCurrent = () => {
    if (current) handoffs.push(current.join(" "));
    current = null;
  };

  for (const line of lines.slice(sectionStart + 1)) {
    if (/^#{1,2}\s+/.test(line)) break;
    const item = line.match(/^\s*-\s+\[([ xX])\]\s+(.+?)\s*$/);
    if (item) {
      finishCurrent();
      current = item[1] === " " ? [item[2].trim()] : null;
      continue;
    }
    if (current && /^\s{2,}\S/.test(line)) {
      current.push(line.trim());
      continue;
    }
    if (line.trim().length > 0) finishCurrent();
  }
  finishCurrent();
  return handoffs;
}

function relativeLabel(root: string, candidate: string): string {
  return path.relative(root, candidate).split(path.sep).join("/");
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function findSensitiveTextIssues(
  relativePath: string,
  content: string,
): string[] {
  const patterns: Array<[RegExp, string]> = [
    [/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/, "OpenAI API key"],
    [/\bgh[opusr]_[A-Za-z0-9]{30,}\b/, "GitHub token"],
    [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
    [/\bBearer\s+[A-Za-z0-9._~+/-]{24,}=*/i, "bearer token"],
    [
      /\b(?:OPENAI_API_KEY|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY)\s*=\s*(?!["']?(?:none|unset|example|<))["']?[^\s"']{12,}/i,
      "credential assignment",
    ],
  ];
  const issues = patterns
    .filter(([pattern]) => pattern.test(content))
    .map(([, label]) => `Secret-like value in ${relativePath}: ${label}`)
    .sort();
  return issues.some((issue) => issue.endsWith(": OpenAI API key"))
    ? issues.filter((issue) => !issue.endsWith(": credential assignment"))
    : issues;
}

async function walkTextFiles(
  root: string,
  directory: string,
  output: string[],
): Promise<void> {
  if (!(await exists(directory))) return;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) continue;
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      if (
        relativeLabel(root, candidate) === "video/accesspatch-demo/assets" ||
        relativeLabel(root, candidate) === "public/runs"
      ) {
        continue;
      }
      await walkTextFiles(root, candidate, output);
      continue;
    }
    if (
      entry.name === "LICENSE" ||
      TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      output.push(candidate);
    }
  }
}

export async function scanRepositorySecrets(projectRoot = PROJECT_ROOT): Promise<{
  filesScanned: number;
  issues: string[];
}> {
  const root = path.resolve(projectRoot);
  const files: string[] = [];
  await walkTextFiles(root, root, files);
  const issues: string[] = [];
  let filesScanned = 0;
  for (const file of files) {
    const relativePath = relativeLabel(root, file);
    try {
      const content = await readFile(file, "utf8");
      filesScanned += 1;
      issues.push(...findSensitiveTextIssues(relativePath, content));
    } catch (error) {
      // Test and build workers may clean their transient output after traversal.
      // Ignore only that race; permission and I/O failures must still fail closed.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return {
    filesScanned,
    issues: [...new Set(issues)].sort(),
  };
}

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    throw new Error("not a PNG");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export function validateVideoProbe(probe: VideoProbe): string[] {
  const issues: string[] = [];
  const streams = probe.streams ?? [];
  const video = streams.find(({ codec_type }) => codec_type === "video");
  const audio = streams.find(({ codec_type }) => codec_type === "audio");
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration >= 180) {
    issues.push("Final video duration must be greater than zero and under 180 seconds.");
  }
  if (video?.codec_name !== "h264") issues.push("Final video codec must be H.264.");
  if (video?.width !== 1920 || video?.height !== 1080) {
    issues.push("Final video resolution must be 1920x1080.");
  }
  if (video?.pix_fmt !== "yuv420p") {
    issues.push("Final video pixel format must be yuv420p.");
  }
  if (video?.r_frame_rate !== "30/1") {
    issues.push("Final video frame rate must be 30 fps.");
  }
  if (audio?.codec_name !== "aac" || audio.channels !== 2) {
    issues.push("Final video audio must be AAC stereo.");
  }
  return issues.sort();
}

async function probeVideo(videoPath: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,channels",
        "-of",
        "json",
        videoPath,
      ],
      {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(
          new Error(
            `ffprobe exited ${exitCode ?? "without a code"}: ${Buffer.concat(stderr).toString("utf8").trim()}`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function validateAssetLedger(root: string, issues: string[]): Promise<void> {
  const ledgerPath = path.join(root, "assets", "ASSET_LEDGER.md");
  if (!(await exists(ledgerPath))) return;
  const ledger = await readFile(ledgerPath, "utf8");
  const rows = ledger.split(/\r?\n/).filter((line) => /^\| AP-ASSET-\d+ /.test(line));
  if (rows.length === 0) {
    issues.push("Asset ledger contains no AP-ASSET entries.");
    return;
  }
  for (const row of rows) {
    const cells = row.split("|").map((cell) => cell.trim());
    const relativePath = cells[2]?.replace(/^`|`$/g, "");
    const expectedHash = cells.at(-2)?.replace(/^`|`$/g, "").toLowerCase();
    if (!relativePath || !expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) {
      issues.push(`Malformed asset-ledger row: ${cells[1] ?? "unknown asset"}`);
      continue;
    }
    const assetPath = path.join(root, relativePath);
    if (!(await exists(assetPath))) {
      issues.push(`Asset ledger references missing file: ${relativePath}`);
      continue;
    }
    const actualHash = createHash("sha256")
      .update(await readFile(assetPath))
      .digest("hex");
    if (actualHash !== expectedHash) {
      issues.push(`Asset ledger hash mismatch: ${relativePath}`);
    }
  }
}

export async function collectSubmissionIssues(
  projectRoot = PROJECT_ROOT,
  options: SubmissionCheckOptions = {},
): Promise<string[]> {
  const root = path.resolve(projectRoot);
  const issues: string[] = [];
  for (const relativePath of REQUIRED_TEXT_ARTIFACTS) {
    const candidate = path.join(root, relativePath);
    if (!(await exists(candidate))) {
      issues.push(`Missing required artifact: ${relativePath}`);
      continue;
    }
    const content = await readFile(candidate, "utf8");
    if (content.trim().length === 0) {
      issues.push(`Required text artifact is empty: ${relativePath}`);
    }
    if (UNFINISHED_COPY.test(content)) {
      issues.push(`Unfinished copy marker in ${relativePath}`);
    }
  }

  for (const [relativePath, width, height] of REQUIRED_IMAGES) {
    const candidate = path.join(root, relativePath);
    if (!(await exists(candidate))) {
      issues.push(`Missing required artifact: ${relativePath}`);
      continue;
    }
    try {
      const dimensions = pngDimensions(await readFile(candidate));
      if (dimensions.width !== width || dimensions.height !== height) {
        issues.push(
          `${relativePath} must be ${width}x${height}; received ${dimensions.width}x${dimensions.height}.`,
        );
      }
    } catch {
      issues.push(`${relativePath} is not a valid PNG.`);
    }
  }

  await validateAssetLedger(root, issues);
  const secrets = await scanRepositorySecrets(root);
  issues.push(...secrets.issues);

  const videoPath = path.join(root, "submission", "accesspatch-eu-demo.mp4");
  if (await exists(videoPath)) {
    try {
      const videoStat = await stat(videoPath);
      if (videoStat.size >= 95_000_000) {
        issues.push("Final video must remain under 95 MB for portable delivery.");
      }
      const probe = await (options.probeVideo ?? probeVideo)(videoPath);
      issues.push(...validateVideoProbe(probe as VideoProbe));
    } catch (error) {
      issues.push(
        `Final video ffprobe failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    issues.push("Missing required artifact: submission/accesspatch-eu-demo.mp4");
  }
  return [...new Set(issues)].sort();
}

export async function runSubmissionCheck(projectRoot = PROJECT_ROOT): Promise<{
  outcome: "passed";
  checkedAt: string;
  externalHandoffs: string[];
  mediaStatus: "validated";
}> {
  const issues = await collectSubmissionIssues(projectRoot);
  if (issues.length > 0) {
    throw new Error(`Submission check failed:\n${issues.join("\n")}`);
  }
  const checklist = await readFile(
    path.join(projectRoot, "submission", "SUBMISSION_CHECKLIST.md"),
    "utf8",
  );
  return {
    outcome: "passed",
    checkedAt: new Date().toISOString(),
    externalHandoffs: parseExternalHandoffs(checklist),
    mediaStatus: "validated",
  };
}
