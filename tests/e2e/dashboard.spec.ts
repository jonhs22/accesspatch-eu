import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { RunManifestSchema, type Finding } from "../../src/contracts/run.js";

test.describe.configure({ mode: "serial" });

const runId = "dashboard-browser-test";
const root = `public/runs/runtime/${runId}`;
const timestamp = "2026-07-20T18:00:00.000Z";
const ids = ["AP-EU-001", "AP-EU-002", "AP-EU-003"] as const;

function finding(id: (typeof ids)[number], phase: "before" | "after" = "before"): Finding {
  const suffix = id.slice(-3);
  return {
    id,
    severity: "critical",
    rule: id === "AP-EU-001" ? "button-name" : "keyboard-journey",
    sourceMarker: `ACCESSPATCH-DEMO-${suffix}` as Finding["sourceMarker"],
    userImpact: `Synthetic keyboard blocker ${suffix}`,
    route: "/checkout",
    journeyStep: `Step ${suffix}`,
    selector: `[data-accesspatch="${suffix}"]`,
    htmlExcerpt: `<button data-accesspatch="${suffix}"></button>`,
    wcagTags: ["wcag2a"],
    evidencePaths: [`${root}/${phase}/keyboard.json`],
    remediationConstraint: "Change only the evidence-backed checkout behavior.",
    verificationAssertion: `Finding ${id} is absent after replay.`,
  };
}

function evidence(phase: "before" | "after") {
  return {
    runId,
    phase,
    url: "http://127.0.0.1:4173/checkout",
    capturedAt: timestamp,
    screenshotPath: `${root}/${phase}/screenshot.png`,
    tracePath: `${root}/${phase}/trace.zip`,
    domPath: `${root}/${phase}/dom.html`,
    ariaSnapshotPath: `${root}/${phase}/aria.yml`,
    axeReportPath: `${root}/${phase}/axe.json`,
    keyboardTracePath: `${root}/${phase}/keyboard.json`,
    findings: phase === "before" ? ids.map((id) => finding(id)) : [],
    journeyChecks: [
      {
        id: "checkout-completes",
        label: "Keyboard checkout completes",
        passed: phase === "after",
        evidencePath: `${root}/${phase}/keyboard.json`,
      },
      {
        id: "focus-escapes-email",
        label: "Focus escapes email",
        passed: phase === "after",
        evidencePath: `${root}/${phase}/keyboard.json`,
      },
      {
        id: "validation-announced",
        label: "Validation is announced",
        passed: phase === "after",
        evidencePath: `${root}/${phase}/keyboard.json`,
      },
    ],
  };
}

const passedManifest = RunManifestSchema.parse({
  schemaVersion: 1,
  revision: 6,
  runId,
  runMode: "deterministic_fixture",
  status: "passed",
  targetUrl: "http://127.0.0.1:4173/checkout",
  editableRoots: ["src/checkout"],
  baselineCommit: "a".repeat(40),
  createdAt: timestamp,
  updatedAt: timestamp,
  toolVersions: {
    node: "24.18.0",
    playwright: "1.61.1",
    axe: "4.12.1",
    accesspatch: "1.0.0",
  },
  before: evidence("before"),
  proposals: ids.map((id) => ({
    findingId: id,
    diagnosis: `Evidence diagnosis for ${id}`,
    proposedChange: `Repair the source behavior for ${id}.`,
    candidateFiles: ["src/checkout/CheckoutPage.tsx"],
  })),
  approval: {
    decision: "approved",
    findingIds: ids,
    actor: "test_fixture",
    recordedAt: timestamp,
  },
  after: evidence("after"),
  verification: {
    outcome: "passed",
    resolvedFindingIds: ids,
    remainingFindingIds: [],
    regressions: [],
    checkoutCompleted: true,
    changedFiles: ["src/checkout/CheckoutPage.tsx"],
    diffWithinAllowlist: true,
    diffPath: `${root}/approved.patch`,
    failureReasons: [],
  },
});

test("renders a passed receipt with keyboard access and no serious axe finding", async ({ page }) => {
  await page.route("**/runs/current.json", (route) =>
    route.fulfill({ json: passedManifest }),
  );
  await page.goto("/accesspatch");

  await expect(page.getByRole("heading", { name: "From blocked checkout to verified journey." })).toBeVisible();
  await expect(page.getByText("Deterministic fixture run", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The approved repair passed every gate." })).toBeVisible();
  await expect(page.getByText("3 / 3")).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(({ impact }) => impact === "critical" || impact === "serious")).toEqual([]);
});

test("uses the AccessPatch EU page title only for the dashboard", async ({ page }) => {
  await page.route("**/runs/current.json", (route) =>
    route.fulfill({ json: passedManifest }),
  );

  await page.goto("/checkout");
  await expect(page).toHaveTitle("Lattice Supply — Checkout");

  await page.goto("/accesspatch");
  await expect(page).toHaveTitle("AccessPatch EU");
});

test("labels the checkout as the restored broken fixture and explains the saved receipt", async ({ page }) => {
  await page.route("**/runs/current.json", (route) =>
    route.fulfill({ json: passedManifest }),
  );
  await page.goto("/accesspatch");

  await expect(page.getByRole("link", { name: "Open restored broken fixture" })).toBeVisible();
  await expect(page.getByText(/restores the original deliberately broken fixture/i)).toBeVisible();
  await expect(page.getByText(/genuine before\/after receipt/i)).toBeVisible();
});

test("copies the judge command and states deterministic approval provenance", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/runs/current.json", (route) =>
    route.fulfill({ json: passedManifest }),
  );
  await page.goto("/accesspatch");

  await expect(page.getByText("npm run demo:verify", { exact: true })).toBeVisible();
  await expect(page.getByText("deterministic_fixture", { exact: true })).toBeVisible();
  await expect(page.getByText("test_fixture", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Copy judge command" }).click();
  await expect(page.getByRole("button", { name: "Judge command copied" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("npm run demo:verify");
});

test("renders explicit missing and corrupt states", async ({ page }) => {
  await page.route("**/runs/current.json", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/accesspatch");
  await expect(page.getByRole("heading", { name: "No AccessPatch run found" })).toBeVisible();

  await page.unroute("**/runs/current.json");
  await page.route("**/runs/current.json", (route) =>
    route.fulfill({ json: { status: "passed", inventedScore: 100 } }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Run evidence could not be trusted" })).toBeVisible();
});

test("stays within a 375px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/runs/current.json", (route) =>
    route.fulfill({ json: passedManifest }),
  );
  await page.goto("/accesspatch");
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
});
