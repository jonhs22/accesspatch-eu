# AccessPatch EU demo video

This directory contains the local-first production pipeline used for the
168-second OpenAI Build Week demo. It is reproducible in the prepared
Windows environment described below.

## Source of truth

- `narration.txt` is the English voice and caption transcript.
- `scenes.json` maps every on-screen claim to project evidence.
- `accesspatch-demo/index.html` is the HyperFrames composition source.
- `accesspatch-demo/assets/live-footage/` contains privacy-safe recordings of
  the real checkout, `npm run demo:verify`, and persisted receipt.
- Root `DESIGN.md` controls palette, typography, spacing, and motion.

All storefront content, identities, form values, and product art are
synthetic. The live footage is captured from localhost with external requests
blocked and no persistent browser profile. The composition contains no account
chrome, credentials, third-party logos, customer data, or downloaded stock
media.

## Reproduce

Prerequisites:

- Windows PowerShell 5.1 or PowerShell 7;
- Node.js 24.18.0+, npm, and first-run network access for the pinned
  `hyperframes@0.7.64` package, browser, fonts, and Kokoro model cache;
- Python 3 with `kokoro-onnx` and `soundfile` available to the local TTS
  workflow;
- FFmpeg/ffprobe 7.x on `PATH`, including H.264 (`libopenh264`) and AAC
  encoding; and
- enough temporary disk space for approximately 1,680 PNG frames.

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/synthesize-narration.ps1
powershell -ExecutionPolicy Bypass -Command "node scripts/capture-live-footage.mjs"
powershell -ExecutionPolicy Bypass -File scripts/record-workflow.ps1
powershell -ExecutionPolicy Bypass -File scripts/render-video.ps1
powershell -ExecutionPolicy Bypass -File scripts/verify-video.ps1
```

The local Kokoro voice and the signed-in Codex workflow do not require an
OpenAI Platform API key. Rendering uses HyperFrames, Chrome, and ffmpeg locally.

The final deliverable is `submission/accesspatch-eu-demo.mp4`: 1920×1080,
30 fps, H.264/yuv420p, AAC stereo, with fast-start metadata and burned-in
English captions.
