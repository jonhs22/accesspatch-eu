import "tsx/esm";

const { PROJECT_ROOT } = await import("../tools/accesspatch/paths.ts");
const { scanRepositorySecrets } = await import(
  "../tools/accesspatch/submission-check.ts"
);

try {
  const result = await scanRepositorySecrets(PROJECT_ROOT);
  if (result.issues.length > 0) {
    throw new Error(`Secret scan failed:\n${result.issues.join("\n")}`);
  }
  process.stdout.write(
    `Secret scan: PASS (${result.filesScanned} text files checked).\n`,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
