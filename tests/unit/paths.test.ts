import path from "node:path";
import { expect, it } from "vitest";
import { PROJECT_ROOT, assertInsideProject } from "../../tools/accesspatch/paths.js";

it("accepts the project root and a descendant", () => {
  expect(assertInsideProject(PROJECT_ROOT)).toBe(PROJECT_ROOT);
  expect(assertInsideProject(path.join(PROJECT_ROOT, "src", "contracts", "run.ts"))).toBe(
    path.join(PROJECT_ROOT, "src", "contracts", "run.ts"),
  );
});

it("accepts a relative path resolved within the project", () => {
  expect(assertInsideProject("src/contracts/run.ts")).toBe(path.join(PROJECT_ROOT, "src", "contracts", "run.ts"));
});

it("rejects a prefix collision beside the project root", () => {
  expect(() => assertInsideProject(`${PROJECT_ROOT}-backup/report.json`)).toThrow(/outside project root/i);
});

it("rejects a path outside the project root", () => {
  expect(() =>
    assertInsideProject("C:\\Users\\User\\Desktop\\outside\\report.json"),
  ).toThrow(/outside project root/i);
});

it.runIf(process.platform === "win32")("accepts Windows paths without case sensitivity", () => {
  const caseChangedRoot = PROJECT_ROOT.replace(/Users/, "USERS");
  expect(assertInsideProject(path.join(caseChangedRoot, "src", "contracts", "run.ts"))).toBe(
    path.join(caseChangedRoot, "src", "contracts", "run.ts"),
  );
});
