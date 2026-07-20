import { useCallback, useEffect, useState } from "react";
import type { DashboardModel } from "./dashboard-model.js";
import {
  createDashboardModel,
  parseDashboardManifest,
} from "./dashboard-model.js";

export interface CurrentRunState {
  loading: boolean;
  model: DashboardModel | null;
  refresh: () => void;
}

export function useCurrentRun(pollMilliseconds = 2000): CurrentRunState {
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<DashboardModel | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  useEffect(() => {
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function load(): Promise<void> {
      try {
        const response = await fetch("/runs/current.json", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 404) {
          if (!disposed) setModel(createDashboardModel(null, "missing"));
          return;
        }
        if (!response.ok) {
          throw new Error(`Manifest request failed with ${response.status}.`);
        }
        const parsed = parseDashboardManifest(await response.json());
        if (!disposed) {
          setModel(
            parsed.ok
              ? createDashboardModel(parsed.manifest)
              : createDashboardModel(null, parsed.code),
          );
        }
      } catch (error) {
        if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) {
          setModel(createDashboardModel(null, "corrupt"));
        }
      } finally {
        if (!disposed) {
          setLoading(false);
          timeout = setTimeout(load, pollMilliseconds);
        }
      }
    }

    void load();
    return () => {
      disposed = true;
      controller.abort();
      if (timeout) clearTimeout(timeout);
    };
  }, [pollMilliseconds, refreshToken]);

  return { loading, model, refresh };
}
