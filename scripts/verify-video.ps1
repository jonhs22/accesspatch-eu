$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$videoPath = Join-Path $projectRoot "submission\accesspatch-eu-demo.mp4"
$captionsPath = Join-Path $projectRoot "video\captions.ass"
$transcriptPath = Join-Path $projectRoot "video\narration.txt"
$scenesPath = Join-Path $projectRoot "video\scenes.json"

foreach ($path in @($videoPath, $captionsPath, $transcriptPath, $scenesPath)) {
    if (-not $path.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Verification path escaped project root: $path"
    }
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing media deliverable: $path"
    }
}

$probeJson = ffprobe -v error -show_entries `
    "format=duration:stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,channels,sample_rate" `
    -of json $videoPath
if ($LASTEXITCODE -ne 0) { throw "ffprobe failed." }
$probe = $probeJson | ConvertFrom-Json

$video = $probe.streams | Where-Object { $_.codec_type -eq "video" } | Select-Object -First 1
$audio = $probe.streams | Where-Object { $_.codec_type -eq "audio" } | Select-Object -First 1
$duration = [double]::Parse(
    [string]$probe.format.duration,
    [System.Globalization.CultureInfo]::InvariantCulture
)

if ($null -eq $video -or $video.codec_name -ne "h264") { throw "Video stream must be H.264." }
if ($video.width -ne 1920 -or $video.height -ne 1080) { throw "Video must be 1920x1080." }
if ($video.pix_fmt -ne "yuv420p") { throw "Video pixel format must be yuv420p." }
if ($video.r_frame_rate -ne "30/1") { throw "Video must be exactly 30 fps." }
if ($duration -lt 150 -or $duration -gt 175) { throw "Video duration must be 150-175 seconds; got $duration." }
if ($null -eq $audio -or $audio.codec_name -ne "aac") { throw "Audio stream must be AAC." }
if ($audio.channels -ne 2) { throw "Audio must be stereo." }

$sceneData = Get-Content -Raw -LiteralPath $scenesPath | ConvertFrom-Json
if ($sceneData.privacy.accountChrome -ne $false -or $sceneData.privacy.thirdPartyLogos -ne $false) {
    throw "Scene metadata allows account chrome or third-party logos."
}

$requiredImages = @(
    "submission\screenshots\01-blocked-keyboard-checkout.png",
    "submission\screenshots\02-evidence-pack.png",
    "submission\screenshots\03-approved-source-diff.png",
    "submission\screenshots\04-verified-before-after.png"
)
foreach ($relativePath in $requiredImages) {
    $path = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing screenshot: $relativePath" }
    $dimensions = ffprobe -v error -select_streams v:0 `
        -show_entries stream=width,height -of csv=s=x:p=0 $path
    if ($dimensions.Trim() -ne "1920x1080") { throw "$relativePath must be 1920x1080." }
}

$ErrorActionPreference = "Continue"
$silenceOutput = & ffmpeg -hide_banner -nostats -i $videoPath `
    -af "silencedetect=noise=-45dB:d=4" -f null NUL 2>&1
$silenceExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($silenceExitCode -ne 0) { throw "Silence sanity check failed." }
if (($silenceOutput | Select-String "silence_start: 0") -and
    ($silenceOutput | Select-String "silence_duration" | Select-Object -First 1)) {
    throw "Video begins with a material silence."
}

$ErrorActionPreference = "Continue"
$blackOutput = & ffmpeg -hide_banner -nostats -i $videoPath `
    -vf "blackdetect=d=2:pix_th=0.04" -an -f null NUL 2>&1
$blackExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($blackExitCode -ne 0) { throw "Black-frame sanity check failed." }
if ($blackOutput | Select-String "black_duration:1[0-9]") {
    throw "Video contains a black segment longer than ten seconds."
}

Write-Output ("Media verification PASS: {0:N1}s, H.264/yuv420p 1920x1080@30, AAC stereo." -f $duration)
