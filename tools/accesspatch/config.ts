import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { LocalTargetUrlSchema } from "../../src/contracts/run.js";
import { PROJECT_ROOT, assertInsideProject, assertSafeGitPath } from "./paths.js";

const RepositoryPathSchema = z.string().superRefine((value, context) => {
  try {
    assertSafeGitPath(value);
  } catch (error) {
    context.addIssue({ code: "custom", message: (error as Error).message });
  }
});

export const AccessPatchConfigSchema = z
  .object({
    targetUrl: LocalTargetUrlSchema,
    editableRoots: z.tuple([z.literal("src/checkout")]),
    artifactRoot: RepositoryPathSchema.refine(
      (value) => value === "public/runs/runtime",
      "Artifact root must be public/runs/runtime.",
    ),
    browser: z
      .object({
        viewport: z
          .object({
            width: z.literal(1672),
            height: z.literal(941),
          })
          .strict(),
        deviceScaleFactor: z.literal(1),
        locale: z.literal("en"),
        reducedMotion: z.literal("reduce"),
      })
      .strict(),
  })
  .strict();

export type AccessPatchConfig = z.infer<typeof AccessPatchConfigSchema>;

export async function loadConfig(
  configPath = path.join(PROJECT_ROOT, "accesspatch.config.json"),
): Promise<AccessPatchConfig> {
  const safePath = assertInsideProject(configPath);
  return AccessPatchConfigSchema.parse(JSON.parse(await readFile(safePath, "utf8")));
}
