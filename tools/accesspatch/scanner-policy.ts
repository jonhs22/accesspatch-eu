import type {
  BrowserContext,
  BrowserContextOptions,
} from "playwright";
import type { KeyboardEnvironment } from "./keyboard-journey.js";

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isLoopback(parsed: URL): boolean {
  return (
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
    parsed.username === "" &&
    parsed.password === ""
  );
}

export function isPermittedHttpUrl(value: string): boolean {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (parsed.protocol === "data:" || parsed.protocol === "about:") return true;
  if (parsed.protocol === "blob:") {
    const blobOrigin = parseUrl(value.slice("blob:".length));
    return Boolean(
      blobOrigin &&
        (blobOrigin.protocol === "http:" || blobOrigin.protocol === "https:") &&
        isLoopback(blobOrigin),
    );
  }
  return (
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    isLoopback(parsed)
  );
}

export function isPermittedWebSocketUrl(value: string): boolean {
  const parsed = parseUrl(value);
  return Boolean(
    parsed &&
      (parsed.protocol === "ws:" || parsed.protocol === "wss:") &&
      isLoopback(parsed),
  );
}

export function sanitizeBlockedExternalUrl(value: string): string {
  if (value === "invalid-external-url") return value;
  const parsed = parseUrl(value);
  if (!parsed || !parsed.hostname) return "invalid-external-url";
  const scheme = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();
  const port = parsed.port ? `:${parsed.port}` : "";
  return `${scheme}//${hostname}${port}`;
}

export function formatBlockedRequestFailure(
  blockedExternalRequests: string[],
): string {
  const sanitized = blockedExternalRequests.map(sanitizeBlockedExternalUrl);
  const origins = [...new Set(sanitized)].sort();
  return `Blocked ${sanitized.length} external network requests (${origins.join(", ")}).`;
}

export function buildBrowserContextOptions(
  environment: KeyboardEnvironment,
): BrowserContextOptions {
  return {
    viewport: environment.viewport,
    deviceScaleFactor: environment.deviceScaleFactor,
    locale: environment.locale,
    reducedMotion: environment.reducedMotion,
    serviceWorkers: "block",
  };
}

export async function installNetworkIsolation(
  context: BrowserContext,
  blockedExternalRequests: string[],
): Promise<void> {
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (isPermittedHttpUrl(url)) {
      await route.continue();
      return;
    }
    blockedExternalRequests.push(sanitizeBlockedExternalUrl(url));
    await route.abort("blockedbyclient");
  });

  await context.routeWebSocket("**", async (webSocket) => {
    const url = webSocket.url();
    if (isPermittedWebSocketUrl(url)) {
      webSocket.connectToServer();
      return;
    }
    blockedExternalRequests.push(sanitizeBlockedExternalUrl(url));
    await webSocket.close({
      code: 1008,
      reason: "AccessPatch permits only loopback WebSockets.",
    });
  });
}
