import { describe, expect, it } from "vitest";
import {
  assertCleanInteractiveWorktree,
  assertHeadUnchanged,
  changedFilesFromNameStatus,
  changedFilesSince,
  normalizeGitPath,
  validateProductPatch,
} from "../../tools/accesspatch/git-guard.js";

describe("git guard", () => {
  it("rejects a dirty interactive source before a run", async () => {
    await expect(assertCleanInteractiveWorktree({ runMode: "interactive" }, { run: async () => ({ stdout: " M src/checkout/CheckoutPage.tsx\0", stderr: "", exitCode: 0 }) })).rejects.toThrow(/clean/i);
  });

  it("uses NUL name-status parsing and includes both sides of a rename", () => {
    expect(changedFilesFromNameStatus("R100\0src/checkout/Old.tsx\0src/checkout/New.tsx\0M\0src/checkout/CheckoutPage.tsx\0")).toEqual(["src/checkout/CheckoutPage.tsx", "src/checkout/New.tsx", "src/checkout/Old.tsx"]);
  });

  it.each([
    "M\0src/checkout/CheckoutPage.tsx",
    "Q\0src/checkout/CheckoutPage.tsx\0",
    "R100\0src/checkout/Old.tsx\0",
    "M\0\0",
  ])("fails closed on malformed name-status output", (output) => {
    expect(() => changedFilesFromNameStatus(output)).toThrow(/malformed|status/i);
  });

  it("includes NUL-delimited untracked files, spaces, and out-of-scope paths", async () => {
    const calls: string[][] = [];
    const changed = await changedFilesSince("a".repeat(40), {
      run: async (args) => {
        calls.push([...args]);
        if (args[0] === "diff") {
          return {
            stdout: "M\0src/checkout/CheckoutPage.tsx\0",
            stderr: "",
            exitCode: 0,
          };
        }
        return {
          stdout: "src/checkout/New File.tsx\0tests/untracked outside.test.ts\0",
          stderr: "",
          exitCode: 0,
        };
      },
    });

    expect(calls).toEqual([
      ["diff", "--name-status", "-z", "a".repeat(40), "--"],
      ["ls-files", "--others", "--exclude-standard", "-z", "--"],
    ]);
    expect(changed).toEqual([
      "src/checkout/CheckoutPage.tsx",
      "src/checkout/New File.tsx",
      "tests/untracked outside.test.ts",
    ]);
    expect(
      validateProductPatch(changed, [
        "src/checkout/CheckoutPage.tsx",
        "src/checkout/New File.tsx",
      ]),
    ).toMatchObject({
      withinAllowlist: false,
      rejectedPaths: ["tests/untracked outside.test.ts"],
    });
  });

  it("fails closed on a truncated untracked path record", async () => {
    await expect(
      changedFilesSince("a".repeat(40), {
        run: async (args) => ({
          stdout: args[0] === "diff" ? "" : "src/checkout/Untracked File.tsx",
          stderr: "",
          exitCode: 0,
        }),
      }),
    ).rejects.toThrow(/NUL|malformed/i);
  });

  it.each(["/src/checkout/CheckoutPage.tsx", "C:/src/checkout/CheckoutPage.tsx", "\\\\server\\share", "src/checkout/../x.tsx", "src\\checkout\\x.tsx", "src/checkout/x:stream", "src/checkout/a\0b"]) ("rejects unsafe Git path %s", (candidate) => {
    expect(() => normalizeGitPath(candidate)).toThrow(/unsafe/i);
  });

  it("narrows product changes to the union of approved checkout candidates", () => {
    expect(validateProductPatch(["src/checkout/CheckoutPage.tsx"], ["src/checkout/CheckoutPage.tsx"])).toEqual({ changedFiles: ["src/checkout/CheckoutPage.tsx"], withinAllowlist: true, rejectedPaths: [] });
    expect(validateProductPatch(["src/checkout/Other.tsx"], ["src/checkout/CheckoutPage.tsx"])).toMatchObject({ withinAllowlist: false });
  });

  it.each(["tests/unit/git-guard.test.ts", "tools/accesspatch/scanner.ts", "fixtures/broken-demo/CheckoutPage.tsx", ".superpowers/sdd/task-4-report.md"]) ("never accepts non-product patch %s", (changed) => {
    expect(validateProductPatch([changed], ["src/checkout/CheckoutPage.tsx"])).toMatchObject({ withinAllowlist: false, rejectedPaths: [changed] });
  });

  it("fails closed when HEAD drifts from the run baseline", async () => {
    await expect(assertHeadUnchanged("a".repeat(40), { run: async () => ({ stdout: `${"b".repeat(40)}\n`, stderr: "", exitCode: 0 }) })).rejects.toThrow(/HEAD changed/i);
  });
});
