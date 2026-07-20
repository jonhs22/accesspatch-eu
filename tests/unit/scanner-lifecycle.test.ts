import { describe, expect, it } from "vitest";
import { withBrowserContext } from "../../tools/accesspatch/scanner-lifecycle.js";

describe("withBrowserContext", () => {
  it("closes a launched browser when newContext fails", async () => {
    let browserClosed = 0;
    const primary = new Error("newContext failed");
    const browser = {
      newContext: async () => {
        throw primary;
      },
      close: async () => {
        browserClosed += 1;
      },
    };

    await expect(
      withBrowserContext({
        launch: async () => browser,
        contextOptions: {},
        run: async () => "unreachable",
      }),
    ).rejects.toBe(primary);
    expect(browserClosed).toBe(1);
  });

  it("does not let context or browser close failures mask the primary error", async () => {
    const primary = new Error("capture failed");
    let contextCloseAttempts = 0;
    let browserCloseAttempts = 0;
    const context = {
      close: async () => {
        contextCloseAttempts += 1;
        throw new Error("context close failed");
      },
    };
    const browser = {
      newContext: async () => context,
      close: async () => {
        browserCloseAttempts += 1;
        throw new Error("browser close failed");
      },
    };

    await expect(
      withBrowserContext({
        launch: async () => browser,
        contextOptions: {},
        run: async () => {
          throw primary;
        },
      }),
    ).rejects.toBe(primary);
    expect(contextCloseAttempts).toBe(1);
    expect(browserCloseAttempts).toBe(1);
  });

  it("surfaces a cleanup failure when the browser work itself succeeded", async () => {
    const cleanup = new Error("context close failed");
    const context = {
      close: async () => {
        throw cleanup;
      },
    };
    const browser = {
      newContext: async () => context,
      close: async () => undefined,
    };

    await expect(
      withBrowserContext({
        launch: async () => browser,
        contextOptions: {},
        run: async () => "captured",
      }),
    ).rejects.toBe(cleanup);
  });
});
