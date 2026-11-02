param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectPath
)

$ErrorActionPreference = 'Stop'
$packageRoot = Split-Path -Parent $PSScriptRoot
$payloadRoot = Join-Path $packageRoot 'payload'
$projectRoot = [IO.Path]::GetFullPath($ProjectPath).TrimEnd('\')
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'package.json'))) { throw "Invalid project path: $projectRoot" }
if (-not (Test-Path -LiteralPath (Join-Path $payloadRoot 'VERSION'))) { throw "Invalid update package: $payloadRoot" }

function Test-PackageHashes {
  $sumsPath = Join-Path $packageRoot 'SHA256SUMS.txt'
  if (-not (Test-Path -LiteralPath $sumsPath)) { throw "Missing package checksums: $sumsPath" }
  foreach ($line in Get-Content -LiteralPath $sumsPath) {
    if ($line -notmatch '^([a-fA-F0-9]{64})  (.+)$') { throw "Invalid checksum line: $line" }
    $expected = $Matches[1].ToLowerInvariant()
    $relative = $Matches[2]
    $source = [IO.Path]::GetFullPath((Join-Path $payloadRoot $relative))
    if (-not $source.StartsWith($payloadRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe checksum path: $relative" }
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Package file missing: $relative" }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "Checksum mismatch: $relative" }
  }
}

function Read-Port {
  $line = Get-Content -LiteralPath (Join-Path $projectRoot '.env') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^PORT=' } | Select-Object -Last 1
  if ($line) { return [int](($line -split '=', 2)[1]) }
  return 3000
}

function Stop-ProjectService {
  $port = Read-Port
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) { return }
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction Stop
  if ($process.ProcessName -ne 'node') { throw "Port $port is owned by non-Node process $($process.ProcessName)" }
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
  if ($processInfo.CommandLine -notmatch 'src[\\/]index\.js') { throw "Port $port is owned by an unrelated Node process" }
  Stop-Process -Id $listener.OwningProcess
  Start-Sleep -Seconds 2
}

function Start-ProjectService {
  $port = Read-Port
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  Start-Process -FilePath $npm -ArgumentList 'start' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'runtime.out.log') -RedirectStandardError (Join-Path $projectRoot 'runtime.err.log')
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Seconds 1
    try {
      $health = Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:$port/health" -TimeoutSec 2
      if ($health.ok -eq $true) { return }
    } catch {}
  }
  throw 'Restored service did not become healthy'
}

function Restore-Backup([string]$BackupPath, [string[]]$NewFiles) {
  foreach ($relative in $NewFiles) {
    $target = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
    if (-not $target.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe rollback target: $target" }
    if (Test-Path -LiteralPath $target -PathType Leaf) { [IO.File]::Delete($target) }
  }
  Get-ChildItem -LiteralPath $BackupPath -Recurse -File | Where-Object { $_.Name -ne 'manifest.json' } | ForEach-Object {
    $relative = $_.FullName.Substring($BackupPath.Length).TrimStart('\')
    $target = Join-Path $projectRoot $relative
    [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $target -Force
  }
}

Test-PackageHashes

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $projectRoot "backups\update-$stamp"
[IO.Directory]::CreateDirectory($backupRoot) | Out-Null
$newFiles = [System.Collections.Generic.List[string]]::new()
$obsoleteFiles = @('src\faceFusion.js', 'src\auth.js', 'test\auth.test.js', 'scripts\mask_clothing_faces.py', 'configure-facefusion.ps1')

try {
  Stop-ProjectService
  $payloadFiles = Get-ChildItem -LiteralPath $payloadRoot -Recurse -File
  foreach ($file in $payloadFiles) {
    $relative = $file.FullName.Substring($payloadRoot.Length).TrimStart('\')
    $target = Join-Path $projectRoot $relative
    if (Test-Path -LiteralPath $target -PathType Leaf) {
      $backupTarget = Join-Path $backupRoot $relative
      [IO.Directory]::CreateDirectory((Split-Path -Parent $backupTarget)) | Out-Null
      Copy-Item -LiteralPath $target -Destination $backupTarget -Force
    } else {
      $newFiles.Add($relative)
    }
  }
  foreach ($relative in $obsoleteFiles) {
    $target = Join-Path $projectRoot $relative
    if (Test-Path -LiteralPath $target -PathType Leaf) {
      $backupTarget = Join-Path $backupRoot $relative
      [IO.Directory]::CreateDirectory((Split-Path -Parent $backupTarget)) | Out-Null
      Copy-Item -LiteralPath $target -Destination $backupTarget -Force
    }
  }
  $envPath = Join-Path $projectRoot '.env'
  if (Test-Path -LiteralPath $envPath) { Copy-Item -LiteralPath $envPath -Destination (Join-Path $backupRoot '.env') -Force }

  foreach ($file in $payloadFiles) {
    $relative = $file.FullName.Substring($payloadRoot.Length).TrimStart('\')
    $target = Join-Path $projectRoot $relative
    [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target -Force
  }
  foreach ($relative in $obsoleteFiles) {
    $target = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
    if (-not $target.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe removal target: $target" }
    if (Test-Path -LiteralPath $target -PathType Leaf) { [IO.File]::Delete($target) }
  }

  $manifest = [PSCustomObject]@{ version = (Get-Content (Join-Path $payloadRoot 'VERSION') -Raw).Trim(); newFiles = @($newFiles) }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backupRoot 'manifest.json') -Encoding UTF8

  Push-Location $projectRoot
  try { & npm.cmd ci --omit=dev } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
  & (Join-Path $projectRoot 'verify-install.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Verification failed' }
  Set-Content -LiteralPath (Join-Path $projectRoot '.last-update-backup') -Value $backupRoot -Encoding UTF8
  & (Join-Path $projectRoot 'start-service.ps1') -SkipVerify
  if ($LASTEXITCODE -ne 0) { throw 'Service start failed' }
  Write-Host "Update installed: $($manifest.version)"
  Write-Host "Backup: $backupRoot"
} catch {
  Write-Warning "Update failed: $($_.Exception.Message)"
  Restore-Backup $backupRoot @($newFiles)
  Push-Location $projectRoot
  try { & npm.cmd ci --omit=dev } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Failed to restore previous dependencies' }
  Start-ProjectService
  Write-Warning "Previous version restored from $backupRoot"
  throw
}
