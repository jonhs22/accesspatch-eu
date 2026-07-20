import { describe, expect, it } from "vitest";
import { RunManifestSchema } from "../../src/contracts/run.js";
import {
  buildBrowserContextOptions,
  formatBlockedRequestFailure,
  isPermittedHttpUrl,
  isPermittedWebSocketUrl,
  sanitizeBlockedExternalUrl,
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

  it("sanitizes adversarial HTTP and WebSocket URLs to useful origins", () => {
    const rawHttp =
      "https://alex.example.com:secret@example.com:8443/alex.example.com/secret?email=alex.example.com&token=secret#alex.example.com-secret";
    const rawWebSocket =
      "wss://alex.example.com:secret@socket.example.com:9443/alex.example.com/secret?email=alex.example.com&token=secret#alex.example.com-secret";
    const blocked = [
      sanitizeBlockedExternalUrl(rawHttp),
      sanitizeBlockedExternalUrl(rawWebSocket),
      sanitizeBlockedExternalUrl("not a valid URL alex.example.com secret"),
    ];

    expect(blocked).toEqual([
      "https://example.com:8443",
      "wss://socket.example.com:9443",
      "invalid-external-url",
    ]);
    const keyboardJson = JSON.stringify({ blockedExternalRequests: blocked });
    const failure = formatBlockedRequestFailure(blocked);
    const failedManifestJson = JSON.stringify(
      RunManifestSchema.parse({
        schemaVersion: 1,
        revision: 1,
        runId: "blocked-url-privacy",
        runMode: "deterministic_fixture",
        status: "failed",
        targetUrl: "http://127.0.0.1:4173/checkout",
        editableRoots: ["src/checkout"],
        baselineCommit: "a".repeat(40),
        createdAt: "2026-07-20T12:00:00.000Z",
        updatedAt: "2026-07-20T12:01:00.000Z",
        toolVersions: {
          node: "24.18.0",
          playwright: "1.61.1",
          axe: "4.12.1",
          accesspatch: "1.0.0",
        },
        error: {
          code: "SCAN_FAILED",
          stage: "scanning",
          message: failure,
          occurredAt: "2026-07-20T12:01:00.000Z",
          retryable: true,
        },
      }),
    );
    const persistedEvidence = `${keyboardJson}\n${failedManifestJson}\nlog=${failure}`;
    expect(persistedEvidence).toContain("3 external network requests");
    expect(persistedEvidence).toContain("https://example.com:8443");
    expect(persistedEvidence).toContain("wss://socket.example.com:9443");
    expect(persistedEvidence).not.toContain("alex.example.com");
    expect(persistedEvidence).not.toContain("secret");
  });
});
