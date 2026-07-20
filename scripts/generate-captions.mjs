import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const narrationPath = path.join(projectRoot, "video", "narration.txt");
const captionsPath = path.join(projectRoot, "video", "captions.ass");
const srtPath = path.join(projectRoot, "submission", "DEMO_CAPTIONS.srt");
const transcriptPath = path.join(projectRoot, "submission", "transcript.txt");

for (const candidate of [narrationPath, captionsPath, srtPath, transcriptPath]) {
  const relative = path.relative(projectRoot, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Caption path escaped project root: ${candidate}`);
  }
}

const narration = (await readFile(narrationPath, "utf8")).trim();
const words = narration.split(/\s+/);
const groups = [];
for (let index = 0; index < words.length;) {
  const remaining = words.length - index;
  let size = remaining <= 6 ? remaining : 5;
  if (remaining > 6 && remaining - size < 3) size = 4;
  groups.push(words.slice(index, index + size).join(" "));
  index += size;
}

function timestamp(seconds) {
  const centiseconds = Math.round(seconds * 100);
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const cs = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function srtTimestamp(seconds) {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

const startAt = 0.35;
const endAt = 165.2;
const secondsPerWord = (endAt - startAt) / words.length;
let elapsedWords = 0;
const cues = groups.map((group) => {
  const wordCount = group.split(/\s+/).length;
  const start = startAt + elapsedWords * secondsPerWord;
  const end = Math.min(endAt, start + Math.max(1.55, wordCount * secondsPerWord - 0.05));
  elapsedWords += wordCount;
  const safeText = group.replace(/[{}]/g, "");
  return { start, end, text: safeText };
});
const dialogue = cues.map(
  ({ start, end, text }) =>
    `Dialogue: 0,${timestamp(start)},${timestamp(end)},AccessPatch,,0,0,0,,${text}`,
);
const srt = cues
  .map(
    ({ start, end, text }, index) =>
      `${index + 1}\n${srtTimestamp(index === 0 ? 0 : start)} --> ${srtTimestamp(end)}\n${text}\n`,
  )
  .join("\n");

const ass = `[Script Info]
Title: AccessPatch EU Build Week demo
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: AccessPatch,Segoe UI,48,&H00F5F4EE,&H000000FF,&H0007100D,&HC007100D,-1,0,0,0,100,100,0,0,3,2,0,2,120,120,96,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogue.join("\n")}
`;

await mkdir(path.dirname(transcriptPath), { recursive: true });
await writeFile(captionsPath, ass, "utf8");
await writeFile(srtPath, srt, "utf8");
await writeFile(transcriptPath, `${narration}\n`, "utf8");
process.stdout.write(`Generated ${groups.length} exact ASS/SRT caption cues and English transcript.\n`);
