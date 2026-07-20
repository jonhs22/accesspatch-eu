import { expect, test } from "@playwright/test";
import {
  buildBrowserContextOptions,
  installNetworkIsolation,
} from "../../tools/accesspatch/scanner-policy.js";

test("scanner policy blocks external WebSockets and permits only local HMR", async ({ browser }) => {
  const blocked: string[] = [];
  const context = await browser.newContext(
    buildBrowserContextOptions({
      viewport: { width: 1672, height: 941 },
      deviceScaleFactor: 1,
      locale: "en",
      reducedMotion: "reduce",
    }),
  );

  try {
    await installNetworkIsolation(context, blocked);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4173/checkout");
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

    const result = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const socket = new WebSocket("wss://example.com/accesspatch-review");
          const timer = window.setTimeout(() => resolve("timeout"), 5_000);
          socket.addEventListener("open", () => {
            window.clearTimeout(timer);
            resolve("opened");
          });
          socket.addEventListener("error", () => {
            window.clearTimeout(timer);
            resolve("blocked");
          });
          socket.addEventListener("close", () => {
            window.clearTimeout(timer);
            resolve("blocked");
          });
        }),
    );

    expect(result).toBe("blocked");
    expect(blocked).toEqual(["wss://example.com/accesspatch-review"]);
  } finally {
    await context.close();
  }
});
