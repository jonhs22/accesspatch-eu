import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AccessPatchConfigSchema, loadConfig } from "../../tools/accesspatch/config.js";
import { PROJECT_ROOT } from "../../tools/accesspatch/paths.js";

describe("AccessPatchConfigSchema", () => {
  it("loads the checked-in deterministic loopback-only configuration", async () => {
    const config = await loadConfig();
    expect(config).toEqual({
      targetUrl: "http://127.0.0.1:4173/checkout",
      editableRoots: ["src/checkout"],
      artifactRoot: "public/runs/runtime",
      browser: {
        viewport: { width: 1672, height: 941 },
        deviceScaleFactor: 1,
        locale: "en",
        reducedMotion: "reduce",
      },
    });
    expect(
      JSON.parse(await readFile(path.join(PROJECT_ROOT, "accesspatch.config.json"), "utf8")),
    ).toEqual(config);
  });

  it.each([
    { targetUrl: "https://example.com/checkout" },
    { targetUrl: "http://localhost.evil.test/checkout" },
    { editableRoots: ["src"] },
    { artifactRoot: "../runtime" },
    { artifactRoot: "C:\\runtime" },
    { browser: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: "en", reducedMotion: "reduce" } },
    { unexpected: true },
  ])("rejects unsafe or nondeterministic overrides: %o", (override) => {
    const valid = {
      targetUrl: "http://127.0.0.1:4173/checkout",
      editableRoots: ["src/checkout"],
      artifactRoot: "public/runs/runtime",
      browser: {
        viewport: { width: 1672, height: 941 },
        deviceScaleFactor: 1,
        locale: "en",
        reducedMotion: "reduce",
      },
    };
    expect(() => AccessPatchConfigSchema.parse({ ...valid, ...override })).toThrow();
  });
});
