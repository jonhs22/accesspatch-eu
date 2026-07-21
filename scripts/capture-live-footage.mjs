import "tsx/esm";

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(projectRoot, "src", "checkout", "CheckoutPage.tsx");
const brokenFixturePath = path.join(
  projectRoot,
  "fixtures",
  "broken-demo",
  "CheckoutPage.tsx",
);
const currentRunPath = path.join(projectRoot, "public", "runs", "current.json");
const outputRoot = path.join(
  projectRoot,
  "video",
  "accesspatch-demo",
  "assets",
  "live-footage",
);
const temporaryRoot = path.join(outputRoot, ".capture-tmp");
const previewPort = Number.parseInt(process.env.ACCESSPATCH_CAPTURE_PORT ?? "4273", 10);
const baseUrl = `http://127.0.0.1:${previewPort}`;

const { withFixtureLock } = await import(
  "../tools/accesspatch/fixture-lock.ts"
);

function assertInsideProject(candidate) {
  const resolved = path.resolve(candidate);
  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Live-footage path escaped the project: ${resolved}`);
  }
  return resolved;
}

for (const candidate of [
  sourcePath,
  brokenFixturePath,
  currentRunPath,
  outputRoot,
  temporaryRoot,
]) {
  assertInsideProject(candidate);
}

if (!Number.isInteger(previewPort) || previewPort < 1024 || previewPort > 65_535) {
  throw new Error(`Invalid ACCESSPATCH_CAPTURE_PORT: ${previewPort}`);
}
if (previewPort === 4173) {
  throw new Error("Live-footage capture must not use the demo workflow port 4173.");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function boundedLog(chunks) {
  return Buffer.concat(chunks).toString("utf8").slice(-24_000).trim();
}

function command(commandName, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, {
      cwd: projectRoot,
      shell: false,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      ...options,
    });
    const stdout = [];
    const stderr = [];
    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
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

async function waitUntilReady(child, stderrChunks) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Capture preview exited before it was ready: ${boundedLog(stderrChunks)}`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/checkout`, {
        cache: "no-store",
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok && (await response.text()).includes("Lattice Supply")) return;
    } catch {
      // The strictly local preview is still starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for the local capture preview at ${baseUrl}.`);
}

async function startCapturePreview() {
  const viteCli = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
  const stderr = [];
  const child = spawn(
    process.execPath,
    [viteCli, "--host", "127.0.0.1", "--port", String(previewPort), "--strictPort"],
    {
      cwd: projectRoot,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  await waitUntilReady(child, stderr);

  let stopped = false;
  return {
    async stop() {
      if (stopped || child.exitCode !== null || child.signalCode !== null) return;
      stopped = true;
      child.kill("SIGTERM");
      const closed = await Promise.race([
        new Promise((resolve) => child.once("close", () => resolve(true))),
        delay(5_000).then(() => false),
      ]);
      if (!closed && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    },
  };
}

async function installSource(bytes) {
  await withFixtureLock(async () => {
    await writeFile(sourcePath, bytes);
    const installed = await readFile(sourcePath);
    if (sha256(installed) !== sha256(bytes)) {
      throw new Error("Checkout fixture installation failed its exact-byte hash check.");
    }
  });
}

async function restrictNetwork(context) {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.protocol === "data:" ||
      ((url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
        url.port === String(previewPort))
    ) {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
}

async function createRecordedPage(browser, label) {
  const rawDirectory = path.join(temporaryRoot, label);
  await mkdir(rawDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: "en",
    colorScheme: "light",
    recordVideo: {
      dir: rawDirectory,
      size: { width: 1920, height: 1080 },
    },
  });
  await restrictNetwork(context);
  const page = await context.newPage();
  return { context, page, video: page.video() };
}

async function encodeMp4(rawPath, outputName) {
  const stagedPath = path.join(temporaryRoot, `${outputName}.mp4`);
  const finalPath = path.join(outputRoot, `${outputName}.mp4`);
  const result = await command("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    rawPath,
    "-an",
    "-vf",
    "fps=30,format=yuv420p",
    "-c:v",
    "libopenh264",
    "-profile:v",
    "high",
    "-coder",
    "cabac",
    "-b:v",
    "6500k",
    "-maxrate",
    "9M",
    "-bufsize",
    "18M",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-movflags",
    "+faststart",
    stagedPath,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`FFmpeg failed for ${outputName}: ${result.stderr}`);
  }
  await rm(finalPath, { force: true });
  await rename(stagedPath, finalPath);
  return finalPath;
}

async function finishRecording(recording, outputName) {
  await recording.context.close();
  const rawPath = await recording.video.path();
  return encodeMp4(rawPath, outputName);
}

async function prepareSceneClip(inputName, outputName, filter, duration) {
  const inputPath = path.join(outputRoot, `${inputName}.mp4`);
  const stagedPath = path.join(temporaryRoot, `${outputName}.mp4`);
  const finalPath = path.join(outputRoot, `${outputName}.mp4`);
  const result = await command("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-an",
    "-vf",
    filter,
    "-t",
    String(duration),
    "-c:v",
    "libopenh264",
    "-profile:v",
    "high",
    "-coder",
    "cabac",
    "-g",
    "30",
    "-b:v",
    "4000k",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-movflags",
    "+faststart",
    stagedPath,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`FFmpeg scene preparation failed for ${outputName}: ${result.stderr}`);
  }
  await rm(finalPath, { force: true });
  await rename(stagedPath, finalPath);
  return finalPath;
}

async function prepareSceneClips() {
  const terminalPath = path.join(outputRoot, "live-terminal.mp4");
  const terminalDuration = (await probeMedia(terminalPath)).durationSeconds;
  const terminalPassStart = Math.max(0, terminalDuration - 18);
  return Promise.all([
    prepareSceneClip(
      "live-before",
      "scene-before",
      "tpad=stop_mode=clone:stop_duration=20,trim=start=1.1:duration=23,setpts=PTS-STARTPTS,fps=30,format=yuv420p",
      23,
    ),
    prepareSceneClip(
      "live-terminal",
      "scene-terminal-start",
      "tpad=stop_mode=clone:stop_duration=20,trim=start=0.5:duration=16.2,setpts=PTS-STARTPTS,fps=30,format=yuv420p",
      16.2,
    ),
    prepareSceneClip(
      "live-terminal",
      "scene-terminal-pass",
      `tpad=stop_mode=clone:stop_duration=20,trim=start=${terminalPassStart}:duration=18,setpts=PTS-STARTPTS,fps=30,format=yuv420p`,
      18,
    ),
    prepareSceneClip(
      "live-receipt",
      "scene-receipt",
      "tpad=stop_mode=clone:stop_duration=20,trim=start=1.2:duration=19.2,setpts=PTS-STARTPTS,fps=30,format=yuv420p",
      19.2,
    ),
  ]);
}

async function captureBrokenCheckout(browser) {
  const recording = await createRecordedPage(browser, "checkout");
  const { page } = recording;
  await page.goto(`${baseUrl}/checkout`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start secure checkout" }).waitFor();
  await delay(1_200);
  await page.getByRole("button", { name: "Start secure checkout" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Complete your order" }).waitFor();
  await delay(1_000);

  const focusTrail = [];
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
    focusTrail.push(
      await page.evaluate(() => document.activeElement?.getAttribute("data-testid")),
    );
    await delay(460);
  }
  if (!focusTrail.every((testId) => testId === "email")) {
    throw new Error(`Broken checkout did not reproduce its focus trap: ${focusTrail}`);
  }
  await page.getByTestId("keyboard-overlay").waitFor();
  await delay(2_200);
  return {
    path: await finishRecording(recording, "live-before"),
    focusTrail,
  };
}

function terminalHtml() {
  return `<!doctype html>
  <html lang="en"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
    body{background:#07100d;color:#f7f7f2;font-family:"Cascadia Mono",Consolas,monospace}
    .rail{height:92px;border-bottom:2px solid #9effb8;padding:0 58px;display:flex;align-items:center;justify-content:space-between;background:#111815}
    .brand{font:750 26px "Segoe UI Variable Display","Segoe UI",Arial,sans-serif}.brand b{color:#9effb8}
    .privacy{font-size:17px;color:#ebeae3;text-transform:uppercase;letter-spacing:.08em}
    main{height:calc(100% - 92px);padding:48px 58px 54px;display:flex;flex-direction:column;gap:24px}
    .command{border-left:8px solid #9effb8;padding:12px 20px;background:#18251f;font-size:28px;line-height:1.35}
    .command span{color:#9effb8}.terminal{min-height:0;flex:1;border:2px solid #40574b;background:#0b1411;padding:28px 32px;overflow:hidden;box-shadow:14px 14px 0 #1b6940}
    pre{height:100%;margin:0;overflow:hidden;white-space:pre-wrap;color:#f5f4ee;font:21px/1.42 "Cascadia Mono",Consolas,monospace}
    .status{display:flex;align-items:center;gap:12px;font-size:18px;color:#ebeae3}.dot{width:14px;height:14px;border-radius:50%;background:#f1bd72}.status.pass .dot{background:#9effb8}.status.fail .dot{background:#ff6b5f}
  </style></head><body>
    <header class="rail"><div class="brand"><b>AP</b> AccessPatch EU</div><div class="privacy">actual localhost output · no account chrome</div></header>
    <main><div class="command"><span>$</span> npm run demo:verify</div><div class="status" id="status"><span class="dot"></span><span id="status-text">RUNNING DETERMINISTIC WORKFLOW</span></div><div class="terminal"><pre id="output"></pre></div></main>
  </body></html>`;
}

async function captureDemoTerminal(browser) {
  const recording = await createRecordedPage(browser, "terminal");
  const { page } = recording;
  await page.setContent(terminalHtml());
  await delay(900);

  const npmCli = process.env.npm_execpath ?? path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  const child = spawn(process.execPath, [npmCli, "run", "demo:verify"], {
    cwd: projectRoot,
    shell: false,
    windowsHide: true,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let rendered = "";
  let appendQueue = Promise.resolve();

  async function append(chunk, channel) {
    const clean = stripAnsi(chunk.toString("utf8"));
    if (channel === "stdout") stdout += clean;
    else stderr += clean;
    rendered += clean;
    await page.evaluate((value) => {
      const output = document.getElementById("output");
      if (output) {
        output.textContent = value;
        output.scrollTop = output.scrollHeight;
      }
    }, rendered.slice(-8_500));
  }

  child.stdout.on("data", (chunk) => {
    appendQueue = appendQueue.then(() => append(chunk, "stdout"));
  });
  child.stderr.on("data", (chunk) => {
    appendQueue = appendQueue.then(() => append(chunk, "stderr"));
  });
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });
  await appendQueue;
  await delay(300);
  await page.evaluate(({ exitCode, signal }) => {
    const status = document.getElementById("status");
    const text = document.getElementById("status-text");
    const passed = exitCode === 0;
    status?.classList.add(passed ? "pass" : "fail");
    if (text) text.textContent = passed ? "VERIFICATION PASS · EXIT 0" : `FAILED · ${signal ?? `EXIT ${exitCode}`}`;
  }, result);
  await delay(result.exitCode === 0 ? 2_200 : 3_000);

  const outputPath = await finishRecording(recording, "live-terminal");
  const transcript = `${stdout}${stderr}`;
  await writeFile(path.join(outputRoot, "live-terminal.txt"), transcript, "utf8");
  if (result.exitCode !== 0) {
    throw new Error(`npm run demo:verify failed: ${transcript.slice(-4_000)}`);
  }
  if (!stdout.includes("AccessPatch verification: PASS")) {
    throw new Error("The real workflow exited cleanly without its PASS receipt.");
  }
  return { path: outputPath, stdout, stderr };
}

async function capturePassedDashboard(browser) {
  const manifest = JSON.parse(await readFile(currentRunPath, "utf8"));
  if (
    manifest.status !== "passed" ||
    manifest.verification?.outcome !== "passed" ||
    manifest.verification?.checkoutCompleted !== true ||
    manifest.verification?.diffWithinAllowlist !== true
  ) {
    throw new Error("Dashboard footage requires a genuine passed verification receipt.");
  }

  const recording = await createRecordedPage(browser, "dashboard");
  const { page } = recording;
  await page.goto(`${baseUrl}/accesspatch`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "From blocked checkout to verified journey." }).waitFor();
  const statusCode = page.locator(".ap-status code");
  await statusCode.waitFor();
  if ((await statusCode.textContent())?.trim() !== "passed") {
    throw new Error("The live dashboard did not render the passed manifest status.");
  }
  await delay(2_000);

  await page.getByRole("heading", {
    name: "The receipt starts with what the browser saw.",
  }).scrollIntoViewIfNeeded();
  await delay(2_800);
  await page.getByRole("heading", {
    name: "The approved repair passed every gate.",
  }).scrollIntoViewIfNeeded();
  await delay(3_600);

  const receipt = await page.locator(".ap-receipt").innerText();
  for (const expected of ["3 / 3", "PASS", "Regressions", "0"]) {
    if (!receipt.includes(expected)) {
      throw new Error(`Passed dashboard receipt is missing ${expected}.`);
    }
  }
  return {
    path: await finishRecording(recording, "live-receipt"),
    runId: manifest.runId,
  };
}

async function probeMedia(candidate) {
  const result = await command("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate",
    "-of",
    "json",
    candidate,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`ffprobe failed for ${candidate}: ${result.stderr}`);
  }
  const parsed = JSON.parse(result.stdout);
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number.parseFloat(parsed.format?.duration ?? "0");
  if (
    video?.codec_name !== "h264" ||
    video.width !== 1920 ||
    video.height !== 1080 ||
    video.pix_fmt !== "yuv420p" ||
    video.r_frame_rate !== "30/1" ||
    !(duration > 0)
  ) {
    throw new Error(`Invalid live-footage media contract for ${candidate}.`);
  }
  const bytes = await readFile(candidate);
  return {
    file: path.relative(projectRoot, candidate).replaceAll("\\", "/"),
    durationSeconds: Number(duration.toFixed(3)),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    video: {
      codec: video.codec_name,
      width: video.width,
      height: video.height,
      pixelFormat: video.pix_fmt,
      frameRate: video.r_frame_rate,
    },
  };
}

async function main() {
  const originalBytes = await readFile(sourcePath);
  const originalHash = sha256(originalBytes);
  const brokenBytes = await readFile(brokenFixturePath);
  const brokenHash = sha256(brokenBytes);
  let browser;
  let preview;
  let primaryError;
  const outputs = [];
  let focusTrail = [];
  let runId = null;
  let stdoutHash = null;

  await mkdir(outputRoot, { recursive: true });
  await rm(temporaryRoot, { recursive: true, force: true });
  await mkdir(temporaryRoot, { recursive: true });

  try {
    await installSource(brokenBytes);
    preview = await startCapturePreview();
    browser = await chromium.launch({ headless: true });

    const checkout = await captureBrokenCheckout(browser);
    outputs.push(checkout.path);
    focusTrail = checkout.focusTrail;

    const terminal = await captureDemoTerminal(browser);
    outputs.push(terminal.path);
    stdoutHash = sha256(Buffer.from(terminal.stdout, "utf8"));

    const dashboard = await capturePassedDashboard(browser);
    outputs.push(dashboard.path);
    runId = dashboard.runId;

    const afterWorkflow = await readFile(sourcePath);
    if (sha256(afterWorkflow) !== brokenHash) {
      throw new Error("The deterministic workflow did not restore the installed broken fixture.");
    }
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = [];
  try {
    await browser?.close();
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await preview?.stop();
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await installSource(originalBytes);
    const restored = await readFile(sourcePath);
    if (sha256(restored) !== originalHash) {
      throw new Error("Live-footage capture failed to restore checkout source exactly.");
    }
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (primaryError || cleanupErrors.length > 0) {
    await delay(500);
    await rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined);
    throw new AggregateError(
      [primaryError, ...cleanupErrors].filter(Boolean),
      "Live-footage capture failed.",
    );
  }

  const sceneOutputs = await prepareSceneClips();
  const clips = [];
  for (const output of outputs) clips.push(await probeMedia(output));
  const sceneClips = [];
  for (const output of sceneOutputs) sceneClips.push(await probeMedia(output));
  const manifest = {
    generatedBy: "scripts/capture-live-footage.mjs",
    privacy: {
      localOnly: true,
      externalRequestsBlocked: true,
      persistentBrowserProfile: false,
      accountChrome: false,
      syntheticCheckoutDataOnly: true,
    },
    provenance: {
      command: "npm run demo:verify",
      runId,
      workflowStdoutSha256: stdoutHash,
      checkoutFocusTrail: focusTrail,
      sourceSha256Before: originalHash,
      sourceSha256After: sha256(await readFile(sourcePath)),
      sourceRestoredExactly: sha256(await readFile(sourcePath)) === originalHash,
    },
    clips,
    sceneClips,
  };
  await writeFile(
    path.join(outputRoot, "live-footage-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await rm(temporaryRoot, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((error) => {
  const messages = error instanceof AggregateError
    ? error.errors.map((entry) => entry instanceof Error ? entry.message : String(entry))
    : [error instanceof Error ? error.message : String(error)];
  process.stderr.write(`${messages.join("\n")}\n`);
  process.exitCode = 1;
});
