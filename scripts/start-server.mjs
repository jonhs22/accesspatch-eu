import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(scriptDirectory, "..");
export const SERVER_URL = "http://127.0.0.1:4173";
export const CHECKOUT_URL = `${SERVER_URL}/checkout`;
export const DASHBOARD_URL = `${SERVER_URL}/accesspatch`;

function boundedLog(chunks) {
  return Buffer.concat(chunks).toString("utf8").slice(-16_384).trim();
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Server startup was interrupted."));
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason ?? new Error("Server startup was interrupted."));
      },
      { once: true },
    );
  });
}

async function isAccessPatchServerReady() {
  try {
    const response = await fetch(CHECKOUT_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return false;
    const body = await response.text();
    return body.includes("Lattice Supply") && body.includes("/src/main.tsx");
  } catch {
    return false;
  }
}

async function waitForClose(child, closePromise, milliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return Promise.race([
    closePromise.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), milliseconds)),
  ]);
}

function stoppableChild(child, closePromise) {
  let stopPromise;
  return async function stop() {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      if (await waitForClose(child, closePromise, 5_000)) return;
      child.kill("SIGKILL");
      if (!(await waitForClose(child, closePromise, 5_000))) {
        throw new Error(`Vite process ${child.pid ?? "unknown"} did not terminate.`);
      }
    })();
    return stopPromise;
  };
}

export async function startServer({ signal } = {}) {
  signal?.throwIfAborted();
  if (await isAccessPatchServerReady()) {
    return {
      url: SERVER_URL,
      checkoutUrl: CHECKOUT_URL,
      dashboardUrl: DASHBOARD_URL,
      pid: null,
      reused: true,
      stop: async () => {},
    };
  }

  const viteCli = path.join(PROJECT_ROOT, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(
    process.execPath,
    [viteCli, "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
    {
      cwd: PROJECT_ROOT,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const stdout = [];
  const stderr = [];
  let spawnError;
  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  child.once("error", (error) => {
    spawnError = error;
  });
  const closePromise = new Promise((resolve) => {
    child.once("close", (exitCode, closeSignal) => {
      resolve({ exitCode, signal: closeSignal });
    });
  });
  const stop = stoppableChild(child, closePromise);

  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) {
        const logs = [boundedLog(stderr), boundedLog(stdout)]
          .filter(Boolean)
          .join("\n");
        throw new Error(
          `Vite exited before becoming ready with code ${child.exitCode ?? "unknown"}${logs ? `: ${logs}` : "."}`,
        );
      }
      if (await isAccessPatchServerReady()) {
        return {
          url: SERVER_URL,
          checkoutUrl: CHECKOUT_URL,
          dashboardUrl: DASHBOARD_URL,
          pid: child.pid ?? null,
          reused: false,
          stop,
        };
      }
      await delay(100, signal);
    }
    throw new Error("Timed out waiting for Vite at http://127.0.0.1:4173.");
  } catch (error) {
    await stop().catch(() => undefined);
    throw error;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isEntryPoint) {
  let server;
  try {
    server = await startServer();
    process.stdout.write(
      `${JSON.stringify(
        {
          url: server.url,
          checkoutUrl: server.checkoutUrl,
          dashboardUrl: server.dashboardUrl,
          pid: server.pid,
          reused: server.reused,
        },
        null,
        2,
      )}\n`,
    );
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  } finally {
    await server?.stop().catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
  }
}
