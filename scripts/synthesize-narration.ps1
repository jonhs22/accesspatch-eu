$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$videoRoot = Join-Path $projectRoot "video\accesspatch-demo"
$rawAudio = Join-Path $videoRoot "assets\narration-fast.wav"
$normalizedAudio = Join-Path $videoRoot "assets\narration-normalized.wav"
$transcript = Join-Path $projectRoot "video\narration.txt"

foreach ($path in @($videoRoot, $transcript)) {
    if (-not $path.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Narration path escaped project root: $path"
    }
}

Push-Location $projectRoot
try {
    npx --yes hyperframes tts $transcript --voice af_nova --speed 0.82 --output $rawAudio
    if ($LASTEXITCODE -ne 0) {
        throw "HyperFrames TTS failed with exit code $LASTEXITCODE."
    }

    ffmpeg -hide_banner -loglevel error -y -i $rawAudio `
        -af "atempo=0.94,loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -ac 2 `
        -c:a pcm_s24le $normalizedAudio
    if ($LASTEXITCODE -ne 0) {
        throw "Narration normalization failed with exit code $LASTEXITCODE."
    }

    $durationText = ffprobe -v error -show_entries format=duration `
        -of default=noprint_wrappers=1:nokey=1 $normalizedAudio
    if ($LASTEXITCODE -ne 0) {
        throw "Could not probe normalized narration."
    }
    $duration = [double]::Parse(
        $durationText.Trim(),
        [System.Globalization.CultureInfo]::InvariantCulture
    )
    if ($duration -lt 150 -or $duration -gt 175) {
        throw "Narration duration $duration seconds is outside 150-175 seconds."
    }

    Write-Output ("Narration ready: {0:N1}s, local Kokoro af_nova, -16 LUFS target." -f $duration)
}
finally {
    Pop-Location
}
