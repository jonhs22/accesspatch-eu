import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

it("keeps validation submission probing out of the broad broken-fixture evidence test", async () => {
  const spec = await readFile(path.join(projectRoot, "tests/e2e/checkout-fixtures.spec.ts"), "utf8");
  const broadTest = spec.match(/test\("broken fixture exposes the three curated blockers",[\s\S]*?\n}\);/);

  expect(broadTest?.[0]).toBeDefined();
  expect(broadTest?.[0]).not.toContain("requestSubmit");
  expect(spec).toMatch(/test\("repaired fixture announces invalid submission semantics",[\s\S]*?requestSubmit/);
});

it("keeps the activated checkout trigger green", async () => {
  const styles = await readFile(path.join(projectRoot, "src/checkout/checkout.css"), "utf8");
  const activeRule = styles.match(/\.start-checkout\.is-active \{([^}]+)}/);

  expect(activeRule?.[1]).toContain("color: #16875f");
  expect(activeRule?.[1]).toContain("border-bottom-width: 2px");
});
