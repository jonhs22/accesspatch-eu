import path from "node:path";
import { expect, it } from "vitest";
import { PROJECT_ROOT, assertInsideProject, assertSafeGitPath } from "../../tools/accesspatch/paths.js";

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
  const outsideProject = path.resolve(PROJECT_ROOT, "..", "outside", "report.json");
  expect(() =>
    assertInsideProject(outsideProject),
  ).toThrow(/outside project root/i);
});

it.runIf(process.platform === "win32")("rejects an absolute Windows path outside the project", () => {
  expect(() =>
    assertInsideProject("C:\\Users\\User\\Desktop\\outside\\report.json"),
  ).toThrow(/outside project root/i);
});

it.runIf(process.platform === "win32")("accepts Windows paths without case sensitivity", () => {
  const caseChangedRoot = PROJECT_ROOT.replace(/Users/, "USERS");
  expect(assertInsideProject(path.join(caseChangedRoot, "src", "contracts", "run.ts"))).toBe(
    path.join(PROJECT_ROOT, "src", "contracts", "run.ts"),
  );
});

it("checks a new output through its real existing parent", () => {
  expect(assertInsideProject("public/new-report.json")).toBe(path.join(PROJECT_ROOT, "public", "new-report.json"));
});

it.each([
  "../outside.ts",
  "/absolute.ts",
  "\\\\server\\share\\file.ts",
  "C:\\outside.ts",
  "src/checkout/file.ts:stream",
  "src\\checkout\\file.ts",
  "src/checkout/\u0000file.ts",
])("rejects unsafe Git-style paths: %s", (candidate) => {
  expect(() => assertSafeGitPath(candidate)).toThrow(/git path/i);
});

it("accepts canonical repository-relative POSIX Git paths", () => {
  expect(assertSafeGitPath("src/checkout/CheckoutPage.tsx")).toBe("src/checkout/CheckoutPage.tsx");
});
