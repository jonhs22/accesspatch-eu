import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const pluginRoot = path.join(root, "plugins", "accesspatch-eu");

describe("AccessPatch Codex plugin contract", () => {
  it("has a versioned discoverable plugin manifest and repo marketplace", async () => {
    const plugin = JSON.parse(
      await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
    ) as Record<string, unknown>;
    const marketplace = JSON.parse(
      await readFile(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"),
    ) as { plugins: Array<{ name: string; source: { path: string } }> };

    expect(plugin).toMatchObject({
      name: "accesspatch-eu",
      version: "1.0.0",
      description: "Diagnose, approve, patch, and verify blocking accessibility defects.",
      skills: "./skills/",
    });
    expect(marketplace.plugins).toContainEqual(
      expect.objectContaining({
        name: "accesspatch-eu",
        source: expect.objectContaining({ path: "./plugins/accesspatch-eu" }),
      }),
    );
  });

  it("documents the full safe scan, approval, patch, and verification workflow", async () => {
    const skill = await readFile(
      path.join(pluginRoot, "skills", "accesspatch", "SKILL.md"),
      "utf8",
    );
    for (const required of [
      "Do not edit source before explicit approval.",
      "localhost",
      "git status --porcelain",
      "src/checkout",
      "scan --phase before",
      "proposals write",
      "approval record",
      "scan --phase after",
      "verify",
      "API key",
      "credential",
      "failure",
    ]) {
      expect(skill).toContain(required);
    }
  });
});
