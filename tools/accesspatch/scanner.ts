import { AxeBuilder } from "@axe-core/playwright";
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { open, readFile } from "node:fs/promises";
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
import {
  PROJECT_ROOT,
  assertInsideProject,
  assertSafeGitPath,
  ensureProjectDirectory,
} from "./paths.js";
import { RunStore, type RunStoreExpectation } from "./run-store.js";
import {
  captureSanitizedDom,
  captureSanitizedOuterHtml,
  scrubPageFormData,
} from "./scanner-artifacts.js";
import { withBrowserContext } from "./scanner-lifecycle.js";
import {
  buildBrowserContextOptions,
  formatBlockedRequestFailure,
  installNetworkIsolation,
} from "./scanner-policy.js";

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
  await ensureProjectDirectory(artifactRoot);
  const runDirectory = assertInsideProject(
    path.join(artifactRoot, manifest.runId),
  );
  await ensureProjectDirectory(runDirectory);
  const phaseDirectory = assertInsideProject(path.join(runDirectory, phase));
  await ensureProjectDirectory(phaseDirectory);

  const absolutePaths = Object.fromEntries(
    Object.entries(relativePaths).map(([key, value]) => [
      key,
      assertInsideProject(path.join(PROJECT_ROOT, value)),
    ]),
  ) as Record<keyof typeof relativePaths, string>;

  const environment: KeyboardEnvironment = config.browser;
  const blockedExternalRequests: string[] = [];
  return withBrowserContext({
    launch: () => chromium.launch(),
    contextOptions: buildBrowserContextOptions(environment),
    run: async (context) => {
      let traceStarted = false;
      try {
        await installNetworkIsolation(context, blockedExternalRequests);
        await context.tracing.start({
          screenshots: false,
          snapshots: false,
          sources: false,
        });
        traceStarted = true;
        const page = await context.newPage();
        await page.goto(config.targetUrl, { waitUntil: "networkidle" });

        const journey = await runKeyboardJourney(
          page,
          environment,
          relativePaths.keyboard,
          blockedExternalRequests,
        );
        const privacy = await scrubPageFormData(page);
        const axeResults = sortAxeResults(
          (await new AxeBuilder({ page }).analyze()) as unknown as AxeResult,
        );
        const [dom, aria, paymentHtml, emailHtml, errorHtml] = await Promise.all([
          captureSanitizedDom(page),
          page.locator("body").ariaSnapshot(),
          captureSanitizedOuterHtml(page.locator('[data-testid="payment-submit"]')),
          captureSanitizedOuterHtml(page.locator('[data-testid="email"]')),
          captureSanitizedOuterHtml(page.locator('[data-testid="form-error"]')),
        ]);
        const keyboardTrace = {
          ...journey.trace,
          blockedExternalRequests: [...blockedExternalRequests].sort(),
          privacy,
        };

        await page.screenshot({ path: absolutePaths.screenshot, fullPage: true });
        await writeClosedFile(absolutePaths.dom, dom);
        await writeClosedFile(absolutePaths.aria, `${aria.trimEnd()}\n`);
        await writeClosedFile(
          absolutePaths.axe,
          `${JSON.stringify(axeResults, null, 2)}\n`,
        );
        await writeClosedFile(
          absolutePaths.keyboard,
          `${JSON.stringify(keyboardTrace, null, 2)}\n`,
        );
        await context.tracing.stop({ path: absolutePaths.trace });
        traceStarted = false;

        if (blockedExternalRequests.length > 0) {
          throw new Error(formatBlockedRequestFailure(blockedExternalRequests));
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
      }
    },
  });
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
