import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectSubmissionIssues,
  findSensitiveTextIssues,
  validateVideoProbe,
} from "../../tools/accesspatch/submission-check.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("submission validation", () => {
  it("returns deterministic sorted missing-artifact messages", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "accesspatch-submit-"));
    roots.push(root);
    expect(await collectSubmissionIssues(root)).toEqual(
      [...(await collectSubmissionIssues(root))].sort(),
    );
    expect(await collectSubmissionIssues(root)).toContain(
      "Missing required artifact: README.md",
    );
  });

  it("detects secret-like values without flagging no-key documentation", () => {
    expect(
      findSensitiveTextIssues("docs/testing.md", "No OpenAI Platform API key is required."),
    ).toEqual([]);
    expect(
      findSensitiveTextIssues(
        "unsafe.env",
        `OPENAI_API_KEY=${"sk-" + "proj-" + "abcdefghijklmnopqrstuvwxyz123456"}`,
      ),
    ).toEqual([
      "Secret-like value in unsafe.env: OpenAI API key",
    ]);
  });

  it("validates final video ffprobe JSON", () => {
    expect(
      validateVideoProbe({
        format: { duration: "168.0" },
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1920,
            height: 1080,
            pix_fmt: "yuv420p",
            r_frame_rate: "30/1",
          },
          { codec_type: "audio", codec_name: "aac", channels: 2 },
        ],
      }),
    ).toEqual([]);
  });

  it("fails closed when the final video is absent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "accesspatch-submit-"));
    roots.push(root);
    expect(await collectSubmissionIssues(root)).toContain(
      "Missing required artifact: submission/accesspatch-eu-demo.mp4",
    );
  });
});
