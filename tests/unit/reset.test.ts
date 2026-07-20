import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  type FileHandle,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resetBrokenDemo } from "../../tools/accesspatch/reset.js";

const roots: string[] = [];
async function fixtureRoot(withRunsDirectory = true): Promise<string> { const root = await mkdtemp(path.join(os.tmpdir(), "accesspatch-reset-")); roots.push(root); await mkdir(path.join(root, "fixtures", "broken-demo"), { recursive: true }); await mkdir(path.join(root, "src", "checkout"), { recursive: true }); if (withRunsDirectory) await mkdir(path.join(root, "public", "runs"), { recursive: true }); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
describe("deterministic demo reset", () => {
  it("copies exactly the broken fixture bytes and reports a verified hash", async () => { const root = await fixtureRoot(); const bytes = Buffer.from([0, 255, 4, 12]); await writeFile(path.join(root, "fixtures", "broken-demo", "CheckoutPage.tsx"), bytes); await writeFile(path.join(root, "src", "checkout", "CheckoutPage.tsx"), "old"); const receipt = await resetBrokenDemo(root); expect(await readFile(path.join(root, "src", "checkout", "CheckoutPage.tsx"))).toEqual(bytes); expect(receipt.sha256).toBe(createHash("sha256").update(bytes).digest("hex")); });
  it("creates the repository-local lock parent on a fresh clone", async () => { const root = await fixtureRoot(false); await writeFile(path.join(root, "fixtures", "broken-demo", "CheckoutPage.tsx"), "source"); await writeFile(path.join(root, "src", "checkout", "CheckoutPage.tsx"), "old"); await resetBrokenDemo(root); await expect(readFile(path.join(root, "public", "runs", ".fixture-reset.lock"))).rejects.toMatchObject({ code: "ENOENT" }); });
  it("preserves the live target and removes temporary state when publish fails", async () => { const root = await fixtureRoot(); await writeFile(path.join(root, "fixtures", "broken-demo", "CheckoutPage.tsx"), "source"); const target = path.join(root, "src", "checkout", "CheckoutPage.tsx"); await writeFile(target, "live"); await expect(resetBrokenDemo(root, { rename: async () => { throw new Error("publish failed"); } })).rejects.toThrow("publish failed"); expect(await readFile(target, "utf8")).toBe("live"); expect(await readdir(path.dirname(target))).toEqual(["CheckoutPage.tsx"]); await expect(readFile(path.join(root, "public", "runs", ".fixture-reset.lock"))).rejects.toMatchObject({ code: "ENOENT" }); });
  it("preserves the live target when writing the temporary file fails", async () => { const root = await fixtureRoot(); await writeFile(path.join(root, "fixtures", "broken-demo", "CheckoutPage.tsx"), "source"); const target = path.join(root, "src", "checkout", "CheckoutPage.tsx"); await writeFile(target, "live"); await expect(resetBrokenDemo(root, { writeTemporary: async () => { throw new Error("write failed"); } })).rejects.toThrow("write failed"); expect(await readFile(target, "utf8")).toBe("live"); expect(await readdir(path.dirname(target))).toEqual(["CheckoutPage.tsx"]); });
  it("validates the temporary hash before publishing", async () => { const root = await fixtureRoot(); await writeFile(path.join(root, "fixtures", "broken-demo", "CheckoutPage.tsx"), "source"); const target = path.join(root, "src", "checkout", "CheckoutPage.tsx"); await writeFile(target, "live"); await expect(resetBrokenDemo(root, { writeTemporary: async (handle: FileHandle) => { await handle.writeFile("wrong"); } })).rejects.toThrow(/hash/i); expect(await readFile(target, "utf8")).toBe("live"); });
});
