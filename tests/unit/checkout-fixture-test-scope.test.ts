import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

it("keeps validation submission probing out of the broad broken-fixture evidence test", async () => {
  const spec = await readFile(path.join(projectRoot, "tests/e2e/checkout-fixtures.spec.ts"), "utf8");
  const broadTest = spec.match(/test\("broken fixture exposes focus trap and unnamed payment control",[\s\S]*?\n}\);/);
  const semanticsProbe = spec.match(/test\("broken and repaired fixtures expose validation announcement semantics",[\s\S]*?\n}\);/);

  expect(broadTest?.[0]).toBeDefined();
  expect(broadTest?.[0]).not.toContain("requestSubmit");
  expect(semanticsProbe?.[0]).toContain('not.toHaveAttribute("role", "alert")');
  expect(semanticsProbe?.[0]).toContain('toHaveAttribute("role", "alert")');
  expect(semanticsProbe?.[0].match(/requestSubmit/g)).toHaveLength(2);
  expect(spec.match(/requestSubmit/g)).toHaveLength(2);
});

it("keeps the activated checkout trigger green", async () => {
  const styles = await readFile(path.join(projectRoot, "src/checkout/checkout.css"), "utf8");
  const activeRule = styles.match(/\.start-checkout\.is-active \{([^}]+)}/);

  expect(activeRule?.[1]).toContain("color: #16875f");
  expect(activeRule?.[1]).toContain("border-bottom-width: 2px");
});
