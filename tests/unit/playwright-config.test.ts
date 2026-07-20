import { expect, it } from "vitest";
import config from "../../playwright.config.js";

it("restricts Playwright discovery to end-to-end tests", () => {
  expect(config.testDir).toBe("./tests/e2e");
});
