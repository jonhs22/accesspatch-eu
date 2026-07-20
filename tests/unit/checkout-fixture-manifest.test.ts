import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

it("keeps curated blocker markers aligned with their fixture-manifest descriptions", async () => {
  const manifest = await readFile(path.join(projectRoot, "fixtures/FIXTURE_MANIFEST.md"), "utf8");
  const mappings = [
    ["ACCESSPATCH-DEMO-001", "Payment action has no accessible name."],
    ["ACCESSPATCH-DEMO-002", "Tab returns to Email."],
    ["ACCESSPATCH-DEMO-003", "Visible validation is not announced."],
  ];

  expect((manifest.match(/ACCESSPATCH-DEMO-00[1-3]/g) ?? [])).toHaveLength(3);
  for (const [marker, description] of mappings) {
    expect(manifest).toContain(`| \`${marker}\` | ${description} |`);
  }
});
