import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type BrowserContext, type Page } from "playwright";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  RunManifestSchema,
  type EvidenceSet,
  type RunManifest,
} from "../../src/contracts/run.js";
import { loadConfig } from "./config.js";
import { withFixtureLock } from "./fixture-lock.js";
import { buildFindings } from "./findings.js";
import {
  runKeyboardJourney,
  type KeyboardEnvironment,
} from "./keyboard-journey.js";
import { PROJECT_ROOT, assertInsideProject, assertSafeGitPath } from "./paths.js";
import { RunStore, type RunStoreExpectation } from "./run-store.js";

const execFileAsync = promisify(execFile);

export type ScanPhase = "before" | "after";

export interface ScanOptions {
  runId?: string;
  runMode?: "interactive" | "deterministic_fixture";
}

interface AxeNode {
  target: unknown;
  html: string;
  [key: string]: unknown;
}

interface AxeRule {
  id: string;
  tags: string[];
  nodes: AxeNode[];
  [key: string]: unknown;
}

interface AxeResult {
  violations: AxeRule[];
  passes: AxeRule[];
  incomplete: AxeRule[];
  inapplicable: AxeRule[];
  [key: string]: unknown;
}

function createRunId(): string {
  const time = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `run-${time}-${randomUUID().slice(0, 8)}`;
}

function artifactPath(runId: string, phase: ScanPhase, name: string): string {
  return assertSafeGitPath(`public/runs/runtime/${runId}/${phase}/${name}`);
}

async function writeClosedFile(filePath: string, content: string): Promise<void> {
  const safePath = assertInsideProject(filePath);
  const handle = await open(safePath, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function sortAxeRule(rule: AxeRule): AxeRule {
  return {
    ...rule,
    tags: [...rule.tags].sort(),
    nodes: [...rule.nodes].sort((left, right) =>
      JSON.stringify(left.target).localeCompare(JSON.stringify(right.target)),
    ),
  };
}

function sortAxeResults(results: AxeResult): AxeResult {
  const sortRules = (rules: AxeRule[]) =>
    [...rules].sort((left, right) => left.id.localeCompare(right.id)).map(sortAxeRule);
  return {
    ...results,
    violations: sortRules(results.violations),
    passes: sortRules(results.passes),
    incomplete: sortRules(results.incomplete),
    inapplicable: sortRules(results.inapplicable),
  };
}

async function sanitizedDom(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, noscript").forEach((element) => element.remove());
    clone.querySelectorAll("input, textarea, select").forEach((element) => {
      element.removeAttribute("value");
      element.removeAttribute("checked");
      element.removeAttribute("selected");
    });
    return `<!doctype html>\n${clone.outerHTML}\n`;
  });
}

async function sanitizedOuterHtml(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((element) => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, textarea, select").forEach((control) => {
      control.removeAttribute("value");
      control.removeAttribute("checked");
      control.removeAttribute("selected");
    });
    clone.removeAttribute("value");
    return clone.outerHTML;
  });
}

function isPermittedRequest(url: string): boolean {
  const parsed = new URL(url);
  if (["data:", "blob:", "about:"].includes(parsed.protocol)) return true;
  return (
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
    parsed.username === "" &&
    parsed.password === ""
  );
}

async function configureLocalNetworkOnly(
  context: BrowserContext,
  blockedExternalRequests: string[],
): Promise<void> {
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (isPermittedRequest(url)) {
      await route.continue();
      return;
    }
    blockedExternalRequests.push(url);
    await route.abort("blockedbyclient");
  });
}

async function repositoryCommit(): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: PROJECT_ROOT,
    windowsHide: true,
  });
  return stdout.trim();
}

async function toolVersions() {
  const packageJson = JSON.parse(
    await readFile(assertInsideProject("package.json"), "utf8"),
  ) as {
    version: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  return {
    node: process.versions.node,
    playwright: packageJson.devDependencies.playwright,
    axe: packageJson.dependencies["axe-core"],
    accesspatch: packageJson.version,
  };
}

async function captureEvidence(
  manifest: RunManifest,
  phase: ScanPhase,
): Promise<EvidenceSet> {
  const config = await loadConfig();
  const relativePaths = {
    screenshot: artifactPath(manifest.runId, phase, "screenshot.png"),
    trace: artifactPath(manifest.runId, phase, "trace.zip"),
    dom: artifactPath(manifest.runId, phase, "dom.html"),
    aria: artifactPath(manifest.runId, phase, "aria.yml"),
    axe: artifactPath(manifest.runId, phase, "axe.json"),
    keyboard: artifactPath(manifest.runId, phase, "keyboard.json"),
  };
  const artifactRoot = assertInsideProject(
    path.join(PROJECT_ROOT, config.artifactRoot),
  );
  await mkdir(artifactRoot, { recursive: true });
  const runDirectory = assertInsideProject(
    path.join(artifactRoot, manifest.runId),
  );
  await mkdir(runDirectory, { recursive: true });
  const phaseDirectory = assertInsideProject(path.join(runDirectory, phase));
  await mkdir(phaseDirectory, { recursive: true });

  const absolutePaths = Object.fromEntries(
    Object.entries(relativePaths).map(([key, value]) => [
      key,
      assertInsideProject(path.join(PROJECT_ROOT, value)),
    ]),
  ) as Record<keyof typeof relativePaths, string>;

  const environment: KeyboardEnvironment = config.browser;
  const blockedExternalRequests: string[] = [];
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: environment.viewport,
    deviceScaleFactor: environment.deviceScaleFactor,
    locale: environment.locale,
    reducedMotion: environment.reducedMotion,
  });
  let traceStarted = false;

  try {
    await configureLocalNetworkOnly(context, blockedExternalRequests);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;
    const page = await context.newPage();
    await page.goto(config.targetUrl, { waitUntil: "networkidle" });

    const journey = await runKeyboardJourney(
      page,
      environment,
      relativePaths.keyboard,
      blockedExternalRequests,
    );
    const axeResults = sortAxeResults(
      (await new AxeBuilder({ page }).analyze()) as unknown as AxeResult,
    );
    const [dom, aria, paymentHtml, emailHtml, errorHtml] = await Promise.all([
      sanitizedDom(page),
      page.locator("body").ariaSnapshot(),
      sanitizedOuterHtml(page, '[data-testid="payment-submit"]'),
      sanitizedOuterHtml(page, '[data-testid="email"]'),
      sanitizedOuterHtml(page, '[data-testid="form-error"]'),
    ]);

    await page.screenshot({ path: absolutePaths.screenshot, fullPage: true });
    await writeClosedFile(absolutePaths.dom, dom);
    await writeClosedFile(absolutePaths.aria, `${aria.trimEnd()}\n`);
    await writeClosedFile(
      absolutePaths.axe,
      `${JSON.stringify(axeResults, null, 2)}\n`,
    );
    await writeClosedFile(
      absolutePaths.keyboard,
      `${JSON.stringify(journey.trace, null, 2)}\n`,
    );
    await context.tracing.stop({ path: absolutePaths.trace });
    traceStarted = false;

    if (blockedExternalRequests.length > 0) {
      throw new Error(
        `Scanner blocked external network requests: ${blockedExternalRequests.sort().join(", ")}`,
      );
    }

    const checkoutSource = await readFile(
      assertInsideProject("src/checkout/CheckoutPage.tsx"),
      "utf8",
    );
    const sourceMarkers = [...new Set(checkoutSource.match(/ACCESSPATCH-DEMO-00[1-3]/g) ?? [])].sort();
    const unnamedPaymentButton = axeResults.violations.some(
      (rule) =>
        rule.id === "button-name" &&
        rule.nodes.some((node) => JSON.stringify(node.target).includes("payment-submit")),
    );
    const findings = buildFindings({
      axeButtonUnnamed: unnamedPaymentButton,
      repeatedFocusTargets: journey.trace.repeatedFocusTargets,
      visibleErrorIsLive: journey.trace.visibleErrorIsLive,
      sourceMarkers,
      evidencePaths: {
        axe: relativePaths.axe,
        aria: relativePaths.aria,
        keyboard: relativePaths.keyboard,
      },
      htmlExcerpts: {
        payment: paymentHtml,
        email: emailHtml,
        error: errorHtml,
      },
    });

    return {
      runId: manifest.runId,
      phase,
      url: config.targetUrl,
      capturedAt: new Date().toISOString(),
      screenshotPath: relativePaths.screenshot,
      tracePath: relativePaths.trace,
      domPath: relativePaths.dom,
      ariaSnapshotPath: relativePaths.aria,
      axeReportPath: relativePaths.axe,
      keyboardTracePath: relativePaths.keyboard,
      findings,
      journeyChecks: journey.journeyChecks,
    };
  } finally {
    if (traceStarted) {
      await context.tracing.stop({ path: absolutePaths.trace }).catch(() => undefined);
    }
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function failedManifest(
  store: RunStore,
  current: RunManifest,
  stage: "scanning" | "verifying",
  error: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  const failed = RunManifestSchema.parse({
    ...current,
    revision: current.revision + 1,
    status: "failed",
    updatedAt: now,
    error: {
      code: stage === "scanning" ? "SCAN_FAILED" : "AFTER_SCAN_FAILED",
      stage,
      message: error instanceof Error ? error.message : String(error),
      occurredAt: now,
      retryable: true,
    },
  });
  await store.write(failed, {
    runId: current.runId,
    revision: current.revision,
    expectedStatus: current.status,
  });
}

export async function scan(
  phase: ScanPhase,
  options: ScanOptions = {},
): Promise<RunManifest> {
  return withFixtureLock(async () => {
    const config = await loadConfig();
    const store = new RunStore(PROJECT_ROOT);

    if (phase === "before") {
      const previous = await store.read();
      const now = new Date().toISOString();
      const initial = RunManifestSchema.parse({
        schemaVersion: 1,
        revision: 0,
        runId: options.runId ?? createRunId(),
        runMode: options.runMode ?? "interactive",
        status: "scanning",
        targetUrl: config.targetUrl,
        editableRoots: config.editableRoots,
        baselineCommit: await repositoryCommit(),
        createdAt: now,
        updatedAt: now,
        toolVersions: await toolVersions(),
      });
      const replacementExpectation: RunStoreExpectation | undefined = previous
        ? {
            runId: previous.runId,
            revision: previous.revision,
            expectedStatus: previous.status,
          }
        : undefined;
      await store.write(initial, replacementExpectation);

      try {
        const before = await captureEvidence(initial, "before");
        const analyzing = RunManifestSchema.parse({
          ...initial,
          revision: 1,
          status: "analyzing",
          updatedAt: new Date().toISOString(),
          before,
        });
        await store.write(analyzing, {
          runId: initial.runId,
          revision: initial.revision,
          expectedStatus: "scanning",
        });
        return analyzing;
      } catch (error) {
        await failedManifest(store, initial, "scanning", error);
        throw error;
      }
    }

    const current = await store.read();
    if (!current) throw new Error("After scan requires an existing run manifest.");
    if (current.status !== "patching") {
      throw new Error(`After scan requires patching status, received ${current.status}.`);
    }

    try {
      const after = await captureEvidence(current, "after");
      const verifying = RunManifestSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: "verifying",
        updatedAt: new Date().toISOString(),
        after,
      });
      await store.write(verifying, {
        runId: current.runId,
        revision: current.revision,
        expectedStatus: "patching",
      });
      return verifying;
    } catch (error) {
      await failedManifest(store, current, "verifying", error);
      throw error;
    }
  });
}
