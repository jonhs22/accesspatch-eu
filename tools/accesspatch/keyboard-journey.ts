import type { Page } from "playwright";
import type { JourneyCheck } from "../../src/contracts/run.js";
import { captureSanitizedOuterHtml } from "./scanner-artifacts.js";

export interface KeyboardEnvironment {
  viewport: { width: 1672; height: 941 };
  deviceScaleFactor: 1;
  locale: "en";
  reducedMotion: "reduce";
}

export interface FocusTarget {
  testId: string | null;
  id: string | null;
  tagName: string;
  role: string | null;
}

export interface KeyboardStep {
  index: number;
  key: "Enter" | "Tab";
  target: FocusTarget;
}

export interface KeyboardJourneyTrace {
  schemaVersion: 1;
  capturedAt: string;
  environment: KeyboardEnvironment;
  steps: KeyboardStep[];
  repeatedFocusTargets: string[];
  visibleErrorIsLive: boolean;
  checkoutCompleted: boolean;
  blockedExternalRequests: string[];
}

export interface KeyboardJourneyResult {
  trace: KeyboardJourneyTrace;
  journeyChecks: JourneyCheck[];
  htmlExcerpts: {
    payment: string;
    email: string;
    error: string;
  };
  redactionTokens: string[];
}

async function activeFocusTarget(page: Page): Promise<FocusTarget> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
      return { testId: null, id: null, tagName: "UNKNOWN", role: null };
    }
    return {
      testId: active.getAttribute("data-testid"),
      id: active.id || null,
      tagName: active.tagName.toLowerCase(),
      role: active.getAttribute("role"),
    };
  });
}

export async function runKeyboardJourney(
  page: Page,
  environment: KeyboardEnvironment,
  keyboardTracePath: string,
  blockedExternalRequests: string[],
): Promise<KeyboardJourneyResult> {
  const steps: KeyboardStep[] = [];
  const start = page.getByRole("button", { name: "Start secure checkout" });
  await start.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Complete your order" }).waitFor();
  const redactionTokens = await page
    .locator("input, textarea, select")
    .evaluateAll((controls) =>
      controls
        .map((control) => (control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)
        .filter((value) => value.length > 0),
    );
  steps.push({ index: 0, key: "Enter", target: await activeFocusTarget(page) });

  const repeatedFocusTargets: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
    const target = await activeFocusTarget(page);
    steps.push({ index: index + 1, key: "Tab", target });
    repeatedFocusTargets.push(target.testId ?? target.id ?? target.tagName);
  }

  await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  const error = page.getByTestId("form-error");
  await error.waitFor();
  const [role, ariaLive] = await Promise.all([
    error.getAttribute("role"),
    error.getAttribute("aria-live"),
  ]);
  const visibleErrorIsLive =
    role === "alert" || ariaLive === "assertive" || ariaLive === "polite";
  const focusEscapedEmail =
    repeatedFocusTargets.some((target) => target !== repeatedFocusTargets[0]);
  const [paymentHtml, emailHtml, errorHtml] = await Promise.all([
    captureSanitizedOuterHtml(page.locator('[data-testid="payment-submit"]')),
    captureSanitizedOuterHtml(page.locator('[data-testid="email"]')),
    captureSanitizedOuterHtml(error),
  ]);

  // Keep the invalid-submit announcement probe above, then replay the same
  // keyboard-only success path used by the repaired fixture. The broken
  // fixture still traps this Tab on Email, so Enter is never sent there and a
  // valid value alone cannot create a false successful journey.
  await page.keyboard.press("Control+A");
  await page.keyboard.type("maya.chen@example.test");
  redactionTokens.push("maya.chen@example.test");
  await page.keyboard.press("Tab");
  const paymentTarget = await activeFocusTarget(page);
  steps.push({ index: steps.length, key: "Tab", target: paymentTarget });
  if (paymentTarget.testId === "payment-submit") {
    await page.keyboard.press("Enter");
    steps.push({ index: steps.length, key: "Enter", target: await activeFocusTarget(page) });
    await page.getByTestId("order-confirmation").waitFor();
  }
  const checkoutCompleted = await page.getByTestId("order-confirmation").isVisible();

  const journeyChecks: JourneyCheck[] = [
    {
      id: "checkout-completes",
      label: "Keyboard journey reaches order confirmation",
      passed: checkoutCompleted,
      evidencePath: keyboardTracePath,
    },
    {
      id: "focus-escapes-email",
      label: "Tab moves focus beyond the email field",
      passed: focusEscapedEmail,
      evidencePath: keyboardTracePath,
    },
    {
      id: "validation-announced",
      label: "Invalid email validation is exposed as a live announcement",
      passed: visibleErrorIsLive,
      evidencePath: keyboardTracePath,
    },
  ];

  return {
    trace: {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      environment,
      steps,
      repeatedFocusTargets,
      visibleErrorIsLive,
      checkoutCompleted,
      blockedExternalRequests: [...blockedExternalRequests].sort(),
    },
    journeyChecks,
    htmlExcerpts: {
      payment: paymentHtml,
      email: emailHtml,
      error: errorHtml,
    },
    redactionTokens: [...new Set(redactionTokens)].sort(),
  };
}
