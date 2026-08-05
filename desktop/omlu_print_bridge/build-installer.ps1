# PowerShell installer packaging script for OMLU Print Bridge
param (
    [string]$OutDir = "./dist"
)

$ErrorActionPreference = "Stop"

Write-Host "Building OMLU Print Bridge TypeScript source..."
npm run build

$HardwareTestDir = Join-Path $OutDir "hardware-test"
if (-not (Test-Path $HardwareTestDir)) {
    New-Item -ItemType Directory -Force -Path $HardwareTestDir
}

$ZipPath = Join-Path $HardwareTestDir "omlu-print-bridge-portable.zip"
Write-Host "Creating hardware-test portable package: $ZipPath"

if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

# Archive compiled dist, package.json, and launch scripts
Compress-Archive -Path "./dist/*", "./package.json" -DestinationPath $ZipPath

Write-Host "OMLU Print Bridge hardware test package generated successfully at $ZipPath"
