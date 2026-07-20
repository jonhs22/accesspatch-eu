import { expect, it } from "vitest";
import { assertInsideProject } from "../../tools/accesspatch/paths.js";

it("rejects a path outside the project root", () => {
  expect(() =>
    assertInsideProject("C:\\Users\\User\\Desktop\\outside\\report.json"),
  ).toThrow(/outside project root/i);
});
