param(
  [string]$OutputDirectory = 'D:\work\project'
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'VERSION') -Raw).Trim()
$stageRoot = Join-Path ([IO.Path]::GetTempPath()) "nano-release-$version"
$packageRoot = Join-Path $stageRoot "nano-banana-update-$version"
$payloadRoot = Join-Path $packageRoot 'payload'
if (Test-Path -LiteralPath $stageRoot) { [IO.Directory]::Delete($stageRoot, $true) }
[IO.Directory]::CreateDirectory($payloadRoot) | Out-Null

$payloadFiles = @(
  '.env.example', 'README.md', 'DEPLOYMENT.md', 'VERSION', 'package.json', 'package-lock.json',
  'Dockerfile', 'docker-compose.yml',
  'verify-install.ps1', 'start-service.ps1', 'collect-diagnostics.ps1'
)
$payloadFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src') -Filter '*.js' -File |
  ForEach-Object { 'src\' + $_.Name }
$payloadFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot 'test') -Filter '*.test.js' -File |
  ForEach-Object { 'test\' + $_.Name }
$payloadFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot 'scripts') -Filter '*.js' -File |
  ForEach-Object { 'scripts\' + $_.Name }
$payloadFiles = @($payloadFiles | Sort-Object -Unique)
foreach ($relative in $payloadFiles) {
  $source = Join-Path $projectRoot $relative
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing release file: $relative" }
  $target = Join-Path $payloadRoot $relative
  [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
}

[IO.Directory]::CreateDirectory((Join-Path $packageRoot 'deployment')) | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'deployment\install-update.ps1') -Destination (Join-Path $packageRoot 'deployment\install-update.ps1') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'deployment\rollback-update.ps1') -Destination (Join-Path $packageRoot 'deployment\rollback-update.ps1') -Force

$hashes = Get-ChildItem -LiteralPath $payloadRoot -Recurse -File | ForEach-Object {
  $relative = $_.FullName.Substring($payloadRoot.Length).TrimStart('\')
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
  "$hash  $relative"
}
$hashes | Set-Content -LiteralPath (Join-Path $packageRoot 'SHA256SUMS.txt') -Encoding ASCII

$zipPath = Join-Path $OutputDirectory "nano-banana-update-$version.zip"
if (Test-Path -LiteralPath $zipPath) { [IO.File]::Delete($zipPath) }
Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal
[IO.Directory]::Delete($stageRoot, $true)
Write-Host "Release created: $zipPath"
