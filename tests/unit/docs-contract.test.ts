import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../../tools/accesspatch/paths.js";

const requiredDocs = [
  "README.md",
  "docs/architecture.md",
  "docs/testing.md",
  "docs/CODEX_COLLABORATION.md",
  "SECURITY.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "submission/DEVPOST.md",
  "submission/DEMO_SCRIPT.md",
  "submission/DEMO_TRANSCRIPT.md",
  "submission/DEMO_CAPTIONS.srt",
  "submission/SUBMISSION_CHECKLIST.md",
  "submission/TEST_CREDENTIALS.md",
] as const;

const claim =
  "Two critical and one serious fixture blocker were resolved, no new serious or critical axe finding appeared, and the scripted keyboard checkout completed.";
const limitation =
  "AccessPatch EU produces technical remediation evidence, not legal advice, certification, or a guarantee of EAA/WCAG compliance. AI-proposed patches require human review.";

async function text(relativePath: string): Promise<string> {
  return readFile(path.join(PROJECT_ROOT, relativePath), "utf8");
}

describe("judge and submission documentation", () => {
  it("ships every required final English document without unfinished markers", async () => {
    const contents = await Promise.all(requiredDocs.map(text));
    for (const content of contents) {
      expect(content.trim().length).toBeGreaterThan(20);
      expect(content).not.toMatch(/\b(?:TODO|TBD|FIXME)\b|lorem ipsum|coming soon/i);
    }
  });

  it("documents the exact no-login judge path, architecture, limits, and actual commands", async () => {
    const readme = await text("README.md");
    for (const expected of [
      "npm ci",
      "npm run demo:verify",
      "npm run judge",
      "npm run typecheck",
      "npm test",
      "npm run test:e2e",
      "npm run build",
      "http://127.0.0.1:4173/accesspatch",
      "AccessPatch verification: PASS",
      "Windows",
      "macOS",
      "Linux",
      "synthetic",
      "MIT",
      "GPT-5.6",
      "Codex",
      "no login",
      "no OpenAI Platform API key",
    ]) {
      expect(readme).toContain(expected);
    }
    expect(readme).toContain(claim);
    expect(readme).toContain(limitation);
  });

  it("states that GPT-5.6 proposes from bounded evidence while deterministic tests decide pass or fail", async () => {
    const combined = [
      await text("README.md"),
      await text("docs/architecture.md"),
      await text("submission/DEVPOST.md"),
    ].join("\n");
    expect(combined).toMatch(/GPT-5\.6[\s\S]*bounded browser evidence[\s\S]*source/i);
    expect(combined).toMatch(/deterministic tests[^.]*decide pass\/fail/i);
    expect(combined).toMatch(/human[^.]*chose|human decision/i);
  });

  it("records collaboration decisions and verification with a feedback handoff field", async () => {
    const collaboration = await text("docs/CODEX_COLLABORATION.md");
    for (const heading of [
      "Timestamp",
      "Task",
      "Files / commit",
      "Human decision",
      "Verification",
    ]) {
      expect(collaboration).toContain(heading);
    }
    expect(collaboration).toMatch(/2026-07-20/);
    expect(collaboration).toMatch(/Feedback session/i);
    expect(collaboration).toMatch(/\/feedback/);
  });

  it("contains complete Devpost, demo, caption, credential, and handoff copy", async () => {
    const devpost = await text("submission/DEVPOST.md");
    for (const section of [
      "## Inspiration",
      "## What it does",
      "## How we built it",
      "## Challenges",
      "## Accomplishments",
      "## What we learned",
      "## What's next",
    ]) {
      expect(devpost).toContain(section);
    }
    expect(devpost).toContain(claim);
    expect(devpost).toContain(limitation);

    expect(await text("submission/DEMO_SCRIPT.md")).toMatch(/0:00|00:00/);
    expect(await text("submission/DEMO_TRANSCRIPT.md")).toContain("AccessPatch EU");
    expect(await text("submission/DEMO_CAPTIONS.srt")).toMatch(
      /^1\r?\n00:00:00,000 --> /,
    );
    expect(await text("submission/TEST_CREDENTIALS.md")).toMatch(
      /no login[\s\S]*no OpenAI Platform API key/i,
    );
    expect(await text("submission/SUBMISSION_CHECKLIST.md")).toMatch(
      /External account handoff/i,
    );
  });
});
