$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$compositionRoot = Join-Path $projectRoot "video\accesspatch-demo"
$submissionRoot = Join-Path $projectRoot "submission"
$framesPath = Join-Path $submissionRoot "accesspatch-frames"
$finalPath = Join-Path $submissionRoot "accesspatch-eu-demo.mp4"
$narrationPath = Join-Path $compositionRoot "assets\narration-normalized.wav"

foreach ($path in @($compositionRoot, $submissionRoot, $framesPath, $finalPath, $narrationPath)) {
    if (-not $path.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Render path escaped project root: $path"
    }
}

New-Item -ItemType Directory -Force -Path $submissionRoot | Out-Null
if (-not (Test-Path -LiteralPath $narrationPath)) {
    & (Join-Path $PSScriptRoot "synthesize-narration.ps1")
    if ($LASTEXITCODE -ne 0) { throw "Narration synthesis failed." }
}
if (Test-Path -LiteralPath $framesPath) {
    $resolvedFrames = (Resolve-Path -LiteralPath $framesPath).Path
    if (-not $resolvedFrames.StartsWith($submissionRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Frame cleanup escaped submission root: $resolvedFrames"
    }
    Remove-Item -LiteralPath $resolvedFrames -Recurse -Force
}

Push-Location $compositionRoot
try {
    npx --yes hyperframes@0.7.64 lint --verbose
    if ($LASTEXITCODE -ne 0) { throw "HyperFrames lint failed." }

    npx --yes hyperframes@0.7.64 validate
    if ($LASTEXITCODE -ne 0) { throw "HyperFrames runtime validation failed." }

    npx --yes hyperframes@0.7.64 inspect --samples 15
    if ($LASTEXITCODE -ne 0) { throw "HyperFrames layout inspection failed." }

    # PNG sequence avoids host-specific codec flags in bundled FFmpeg builds.
    # The authored frames are sampled at 10 fps, then deterministically conformed
    # to the required 30 fps delivery stream by the final encoder.
    npx --yes hyperframes@0.7.64 render --format png-sequence --fps 10 --quality high --workers 6 --output $framesPath
    if ($LASTEXITCODE -ne 0) { throw "HyperFrames PNG-sequence render failed." }
}
finally {
    Pop-Location
}

ffmpeg -hide_banner -loglevel error -y `
    -framerate 10 -start_number 0 -i (Join-Path $framesPath "frame_%06d.png") `
    -i $narrationPath `
    -filter_complex "[1:a]apad=pad_dur=3[audio]" `
    -map "0:v:0" -map "[audio]" -t 168 `
    -vf "fps=30,format=yuv420p" `
    -c:v libopenh264 -profile:v high -coder cabac -b:v 3500k -maxrate 5M -bufsize 10M `
    -pix_fmt yuv420p -r 30 `
    -c:a aac -b:a 192k -ac 2 -ar 48000 `
    -movflags +faststart $finalPath
if ($LASTEXITCODE -ne 0) {
    throw "Final H.264/AAC encode failed."
}

Remove-Item -LiteralPath $framesPath -Recurse -Force
Write-Output "Final video: $finalPath"
