$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $projectRoot
try {
    npm run demo:verify
    if ($LASTEXITCODE -ne 0) { throw "Deterministic workflow did not pass." }

    node scripts/capture-demo.mjs
    if ($LASTEXITCODE -ne 0) { throw "Browser media capture failed." }
}
finally {
    Pop-Location
}
