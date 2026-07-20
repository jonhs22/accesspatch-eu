import { expect, test } from "@playwright/test";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const checkoutSource = path.join(projectRoot, "src/checkout/CheckoutPage.tsx");
const repairedFixture = path.join(projectRoot, "fixtures/repaired-demo/CheckoutPage.tsx");

test.describe.configure({ mode: "serial" });

async function withRepairedFixture(action: () => Promise<void>) {
  const originalSource = await readFile(checkoutSource);

  try {
    await copyFile(repairedFixture, checkoutSource);
    await action();
  } finally {
    await writeFile(checkoutSource, originalSource);
    expect(await readFile(checkoutSource)).toEqual(originalSource);
  }
}

test("broken fixture exposes the three curated blockers", async ({ page }) => {
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Start secure checkout" }).press("Enter");

  const focusTargets: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
    focusTargets.push(
      await page.evaluate(
        () => document.activeElement?.getAttribute("data-testid") ?? "",
      ),
    );
  }

  expect(new Set(focusTargets).size).toBe(1);
  await expect(page.locator('[data-testid="payment-submit"]')).toHaveAccessibleName("");
  await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.locator('[data-testid="form-error"]')).not.toHaveAttribute("role", "alert");
});

test("repaired fixture completes checkout using only focused keyboard controls", async ({ page }) => {
  await withRepairedFixture(async () => {
    await page.goto("/checkout");
    await page.getByRole("button", { name: "Start secure checkout" }).press("Enter");

    await expect(page.getByRole("button", { name: "Start secure checkout" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Complete your order" })).toBeVisible();
    await expect(page.getByTestId("keyboard-overlay")).toHaveText("Tab moves through checkout controls");
    await expect(page.getByTestId("email")).toBeFocused();
    await expect(page.getByTestId("payment-submit")).toHaveAccessibleName("Confirm and pay €42.00");

    await page.keyboard.press("Control+A");
    await page.keyboard.type("maya.chen@example.test");
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("payment-submit")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("order-confirmation")).toBeVisible();
  });
});

test("repaired fixture announces invalid submission semantics", async ({ page }) => {
  await withRepairedFixture(async () => {
    await page.goto("/checkout");
    await page.getByRole("button", { name: "Start secure checkout" }).press("Enter");

    await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect(page.getByTestId("form-error")).toHaveAttribute("role", "alert");
    await expect(page.getByTestId("email")).toBeFocused();
  });
});
