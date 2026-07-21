import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const root = process.cwd();

function probe(relativePath: string) {
  return JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,channels",
        "-of",
        "json",
        path.join(root, relativePath),
      ],
      { encoding: "utf8", windowsHide: true },
    ),
  ) as {
    format: { duration?: string };
    streams: Array<{
      codec_type: "video" | "audio";
      codec_name: string;
      width?: number;
      height?: number;
      pix_fmt?: string;
      r_frame_rate?: string;
      channels?: number;
    }>;
  };
}

test("@media submission media matches the Build Week delivery contract", async () => {
  const screenshots = [
    "01-blocked-keyboard-checkout.png",
    "02-evidence-pack.png",
    "03-approved-source-diff.png",
    "04-verified-before-after.png",
  ];
  for (const name of screenshots) {
    const metadata = probe(`submission/screenshots/${name}`).streams[0];
    expect([metadata.width, metadata.height]).toEqual([1920, 1080]);
  }

  const thumbnail = probe("submission/accesspatch-eu-thumbnail.png").streams[0];
  const thumbnailFallback = probe("submission/accesspatch-eu-thumbnail-1280x720.png").streams[0];
  expect([thumbnail.width, thumbnail.height]).toEqual([3000, 2000]);
  expect([thumbnailFallback.width, thumbnailFallback.height]).toEqual([1280, 720]);

  const videoProbe = probe("submission/accesspatch-eu-demo.mp4");
  const video = videoProbe.streams.find(({ codec_type }) => codec_type === "video");
  const audio = videoProbe.streams.find(({ codec_type }) => codec_type === "audio");
  expect(video).toMatchObject({
    codec_name: "h264",
    width: 1920,
    height: 1080,
    pix_fmt: "yuv420p",
    r_frame_rate: "30/1",
  });
  expect(audio).toMatchObject({ codec_name: "aac", channels: 2 });
  const duration = Number(videoProbe.format.duration);
  expect(duration).toBeGreaterThanOrEqual(150);
  expect(duration).toBeLessThanOrEqual(175);

  const [captions, transcript, scenes] = await Promise.all([
    readFile(path.join(root, "video", "captions.ass"), "utf8"),
    readFile(path.join(root, "submission", "transcript.txt"), "utf8"),
    readFile(path.join(root, "video", "scenes.json"), "utf8"),
  ]);
  expect(captions.match(/^Dialogue:/gm)?.length ?? 0).toBeGreaterThan(50);
  expect(transcript).toMatch(/AccessPatch EU/);
  expect(JSON.parse(scenes).privacy).toMatchObject({
    accountChrome: false,
    thirdPartyLogos: false,
    realCustomerData: false,
  });
  expect((await stat(path.join(root, "submission", "accesspatch-eu-demo.mp4"))).size).toBeGreaterThan(1_000_000);
  expect((await stat(path.join(root, "submission", "accesspatch-eu-demo.mp4"))).size).toBeLessThan(95_000_000);
});
