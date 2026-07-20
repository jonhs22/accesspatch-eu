import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resetBrokenDemo } from "../../tools/accesspatch/reset.js";

const roots: string[] = [];
async function fixtureRoot(): Promise<string> { const root = await mkdtemp(path.join(os.tmpdir(), "accesspatch-reset-")); roots.push(root); await mkdir(path.join(root, "fixtures", "broken-demo"), { recursive: true }); await mkdir(path.join(root, "src", "checkout"), { recursive: true }); await mkdir(path.join(root, "public", "runs"), { recursive: true }); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
describe("deterministic demo reset", () => {
  it("copies exactly the broken fixture bytes and reports a verified hash", async () => { const root = await fixtureRoot(); const bytes = Buffer.from([0, 255, 4, 12]); await writeFile(path.join(root, "fixtures", "broken-demo", "CheckoutPage.tsx"), bytes); await writeFile(path.join(root, "src", "checkout", "CheckoutPage.tsx"), "old"); const receipt = await resetBrokenDemo(root); expect(await readFile(path.join(root, "src", "checkout", "CheckoutPage.tsx"))).toEqual(bytes); expect(receipt.sha256).toBe(createHash("sha256").update(bytes).digest("hex")); });
  it("cleans the exclusive lock when copying fails", async () => { const root = await fixtureRoot(); await writeFile(path.join(root, "fixtures", "broken-demo", "CheckoutPage.tsx"), "source"); await expect(resetBrokenDemo(root, { copy: async () => { throw new Error("copy failed"); } })).rejects.toThrow("copy failed"); await expect(readFile(path.join(root, "public", "runs", ".fixture-reset.lock"))).rejects.toMatchObject({ code: "ENOENT" }); });
  it("fails if the copied target hash does not match the fixture", async () => { const root = await fixtureRoot(); await writeFile(path.join(root, "fixtures", "broken-demo", "CheckoutPage.tsx"), "source"); await expect(resetBrokenDemo(root, { copy: async (_source, target) => writeFile(target, "wrong") })).rejects.toThrow(/hash/i); });
});
