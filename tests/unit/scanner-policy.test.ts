import { describe, expect, it } from "vitest";
import {
  buildBrowserContextOptions,
  isPermittedHttpUrl,
  isPermittedWebSocketUrl,
} from "../../tools/accesspatch/scanner-policy.js";

describe("scanner network policy", () => {
  it("permits only loopback HTTP transports and browser-internal artifact URLs", () => {
    expect(isPermittedHttpUrl("http://127.0.0.1:4173/checkout")).toBe(true);
    expect(isPermittedHttpUrl("https://localhost:4173/asset.js")).toBe(true);
    expect(isPermittedHttpUrl("data:text/plain,local")).toBe(true);
    expect(isPermittedHttpUrl("blob:http://127.0.0.1:4173/id")).toBe(true);
    expect(isPermittedHttpUrl("blob:https://example.com/id")).toBe(false);
    expect(isPermittedHttpUrl("https://example.com/checkout")).toBe(false);
    expect(isPermittedHttpUrl("http://127.0.0.1.evil.test/checkout")).toBe(false);
  });

  it("permits only loopback ws/wss and rejects external WebSockets", () => {
    expect(isPermittedWebSocketUrl("ws://127.0.0.1:4173/?token=hmr")).toBe(true);
    expect(isPermittedWebSocketUrl("wss://localhost:4173/hmr")).toBe(true);
    expect(isPermittedWebSocketUrl("wss://example.com/socket")).toBe(false);
    expect(isPermittedWebSocketUrl("ws://localhost.evil.test/socket")).toBe(false);
    expect(isPermittedWebSocketUrl("https://localhost/socket")).toBe(false);
  });

  it("builds a deterministic context that blocks service workers", () => {
    expect(
      buildBrowserContextOptions({
        viewport: { width: 1672, height: 941 },
        deviceScaleFactor: 1,
        locale: "en",
        reducedMotion: "reduce",
      }),
    ).toEqual({
      viewport: { width: 1672, height: 941 },
      deviceScaleFactor: 1,
      locale: "en",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
  });
});
