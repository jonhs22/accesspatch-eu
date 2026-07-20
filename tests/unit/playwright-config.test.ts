import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "../../playwright.config.js";

it("restricts Playwright discovery to end-to-end tests", () => {
  expect(config.testDir).toBe("./tests/e2e");
});

it("serializes fixture-mutating end-to-end specs globally", () => {
  expect(config.workers).toBe(1);
  expect(config.fullyParallel).toBe(false);
});

it("typechecks the Playwright configuration", async () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const tsconfig = JSON.parse(await readFile(path.join(projectRoot, "tsconfig.json"), "utf8")) as { include: string[] };
  expect(tsconfig.include).toContain("playwright.config.ts");
});
