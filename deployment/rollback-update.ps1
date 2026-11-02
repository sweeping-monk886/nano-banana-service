param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectPath
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath($ProjectPath).TrimEnd('\')
$pointer = Join-Path $projectRoot '.last-update-backup'
if (-not (Test-Path -LiteralPath $pointer)) { throw "No update backup pointer found: $pointer" }
$backupRoot = (Get-Content -LiteralPath $pointer -Raw).Trim()
if (-not (Test-Path -LiteralPath (Join-Path $backupRoot 'manifest.json'))) { throw "Backup is incomplete: $backupRoot" }
$manifest = Get-Content -LiteralPath (Join-Path $backupRoot 'manifest.json') -Raw | ConvertFrom-Json

$envLine = Get-Content -LiteralPath (Join-Path $projectRoot '.env') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^PORT=' } | Select-Object -Last 1
$port = if ($envLine) { [int](($envLine -split '=', 2)[1]) } else { 3000 }
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction Stop
  if ($process.ProcessName -ne 'node') { throw "Port $port is owned by non-Node process $($process.ProcessName)" }
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
  if ($processInfo.CommandLine -notmatch 'src[\\/]index\.js') { throw "Port $port is owned by an unrelated Node process" }
  Stop-Process -Id $listener.OwningProcess
  Start-Sleep -Seconds 2
}

foreach ($relative in @($manifest.newFiles)) {
  $target = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
  if (-not $target.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe rollback target: $target" }
  if (Test-Path -LiteralPath $target -PathType Leaf) { [IO.File]::Delete($target) }
}
Get-ChildItem -LiteralPath $backupRoot -Recurse -File | Where-Object { $_.Name -ne 'manifest.json' } | ForEach-Object {
  $relative = $_.FullName.Substring($backupRoot.Length).TrimStart('\')
  $target = Join-Path $projectRoot $relative
  [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
  Copy-Item -LiteralPath $_.FullName -Destination $target -Force
}
Push-Location $projectRoot
try { & npm.cmd ci --omit=dev } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed while restoring dependencies' }
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
Start-Process -FilePath $npm -ArgumentList 'start' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'runtime.out.log') -RedirectStandardError (Join-Path $projectRoot 'runtime.err.log')
$healthy = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:$port/health" -TimeoutSec 2
    # The previous release may predate the service identity field.
    if ($health.ok -eq $true) { $healthy = $true; break }
  } catch {}
}
if (-not $healthy) { throw 'Previous version was restored but did not become healthy' }
Write-Host "Previous version restored from $backupRoot"
