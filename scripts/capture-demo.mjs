import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startServer } from "./start-server.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const screenshotRoot = path.join(projectRoot, "submission", "screenshots");
const submissionRoot = path.join(projectRoot, "submission");
const baseUrl = "http://127.0.0.1:4173";

for (const candidate of [screenshotRoot, submissionRoot]) {
  const relative = path.relative(projectRoot, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Capture path escaped project root: ${candidate}`);
  }
}

await mkdir(screenshotRoot, { recursive: true });

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

let browser;
let server;
try {
  server = await startServer();
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: "en",
    reducedMotion: "reduce",
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.protocol === "data:" ||
      ((url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
        url.port === "4173")
    ) {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });

  const page = await context.newPage();
  await page.goto(`${baseUrl}/checkout`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start secure checkout" }).focus();
  await page.keyboard.press("Enter");
  for (let index = 0; index < 5; index += 1) await page.keyboard.press("Tab");
  await page.screenshot({
    path: path.join(screenshotRoot, "01-blocked-keyboard-checkout.png"),
  });

  await page.goto(`${baseUrl}/accesspatch`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "From blocked checkout to verified journey." }).waitFor();
  await page.getByRole("heading", { name: "The receipt starts with what the browser saw." }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(screenshotRoot, "02-evidence-pack.png"),
  });

  const manifest = JSON.parse(
    await readFile(path.join(projectRoot, "public", "runs", "current.json"), "utf8"),
  );
  if (manifest.status !== "passed" || manifest.verification?.outcome !== "passed") {
    throw new Error("Media capture requires a genuine passed AccessPatch receipt.");
  }
  const diffPath = path.resolve(projectRoot, manifest.verification.diffPath);
  const relativeDiff = path.relative(projectRoot, diffPath);
  if (relativeDiff.startsWith("..") || path.isAbsolute(relativeDiff)) {
    throw new Error("Diff artifact escaped project root.");
  }
  const diff = await readFile(diffPath, "utf8");
  await page.setContent(`<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#07100d;color:#f5f4ee;font-family:"Segoe UI",Arial,sans-serif}
      header{height:88px;border-bottom:2px solid #9effb8;padding:0 72px;display:flex;align-items:center;justify-content:space-between;font-weight:800;font-size:25px}
      header span{color:#9effb8;font-family:Consolas,monospace;font-size:19px}
      main{padding:54px 72px}p{margin:0 0 14px;color:#9effb8;font:700 18px Consolas,monospace;text-transform:uppercase;letter-spacing:.1em}
      h1{margin:0 0 32px;font-size:60px;letter-spacing:-.04em}
      pre{height:720px;margin:0;border:2px solid #9effb8;padding:32px;overflow:hidden;background:#111815;color:#f5f4ee;font:19px/1.45 Consolas,monospace;white-space:pre-wrap}
    </style></head><body><header>AccessPatch EU <span>approved diff · allowlist PASS</span></header>
    <main><p>Genuine deterministic fixture receipt</p><h1>Only the approved checkout source changed.</h1>
    <pre>${escapeHtml(diff)}</pre></main></body></html>`);
  await page.screenshot({
    path: path.join(screenshotRoot, "03-approved-source-diff.png"),
  });

  await page.goto(`${baseUrl}/accesspatch`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "The approved repair passed every gate." }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(screenshotRoot, "04-verified-before-after.png"),
  });

  const thumbnailHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;width:100vw;height:100vh;overflow:hidden;background:#07100d;color:#f5f4ee;font-family:"Segoe UI",Arial,sans-serif}
    .rail{height:8vh;border-bottom:.18vh solid #9effb8;display:flex;align-items:center;justify-content:space-between;padding:0 4.8vw;font-size:1.45vw;font-weight:800}
    .rail span{color:#9effb8;font:700 1vw Consolas,monospace;text-transform:uppercase}
    main{height:92vh;padding:6vh 4.8vw;display:grid;grid-template-columns:1.1fr .9fr;gap:4vw;align-items:center}
    .eyebrow{color:#9effb8;font:700 1.1vw Consolas,monospace;text-transform:uppercase;letter-spacing:.12em}
    h1{margin:2vh 0 2.5vh;font-size:5.8vw;line-height:.95;letter-spacing:-.055em;max-width:11ch}
    p{max-width:42ch;font-size:1.45vw;line-height:1.4}
    .receipt{border:.18vw solid #9effb8;box-shadow:1vw 1vw 0 #9effb8;padding:2.5vw}
    .receipt h2{font-size:2.6vw;margin:0 0 2vh}.stat{border-top:.1vw solid #728079;padding:1.4vh 0;display:flex;justify-content:space-between;font:700 1.35vw Consolas,monospace}.stat strong{color:#9effb8}
  </style></head><body><div class="rail">AccessPatch EU <span>OpenAI Build Week · Developer Tools</span></div>
  <main><section><div class="eyebrow">Scan → approve → patch → verify</div><h1>Fix the blocker. Prove the journey.</h1>
  <p>Codex-assisted accessibility repair with explicit approval, a constrained diff, and deterministic keyboard verification.</p></section>
  <section class="receipt"><h2>Verification receipt</h2><div class="stat"><span>Known blockers</span><strong>3 / 3 resolved</strong></div>
  <div class="stat"><span>Critical regressions</span><strong>0</strong></div><div class="stat"><span>Keyboard checkout</span><strong>PASS</strong></div>
  <div class="stat"><span>Diff allowlist</span><strong>PASS</strong></div></section></main></body></html>`;
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.setContent(thumbnailHtml);
  await page.screenshot({
    path: path.join(submissionRoot, "accesspatch-eu-thumbnail.png"),
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.setContent(thumbnailHtml);
  await page.screenshot({
    path: path.join(submissionRoot, "accesspatch-eu-thumbnail-1280x720.png"),
  });

  await context.close();
  process.stdout.write("Captured four genuine screenshots and two thumbnail sizes.\n");
} finally {
  if (browser) await browser.close().catch(() => undefined);
  await server?.stop().catch(() => undefined);
}
