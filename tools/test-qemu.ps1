param(
    [string]$Fixtures = 'D:\csqtt-tooling\qemu-test\release',
    [string]$Qemu = 'C:\Program Files\qemu\qemu-system-mipsel.exe',
    [ValidateRange(30, 3600)][int]$SecondsPerCore = 60
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:CSQTT_QEMU_FIXTURES = $Fixtures
$env:CSQTT_QEMU_EXE = $Qemu
$env:CSQTT_SOAK_SECONDS = "$SecondsPerCore"
Push-Location $projectRoot
try {
    # Package the existing compiled MIPS cores, validating their recorded hashes.
    & node luci-app-csqtt/build-package.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Package build failed; QEMU was not started' }
    & node tools/verify-panel.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Package verification failed; QEMU was not started' }
    New-Item -ItemType Directory -Force -Path qemu-results | Out-Null
    & node tools/test-rpc.mjs qemu-results/rpc-regression.uc
    if ($LASTEXITCODE -ne 0) { throw 'RPC regression generation failed' }
    & node tools/qemu-soak.mjs
    if ($LASTEXITCODE -ne 0) { throw 'QEMU validation failed; see qemu-results/result.json and serial logs' }
}
finally {
    Pop-Location
}
