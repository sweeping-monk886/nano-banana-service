param(
  [switch]$SkipVerify
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
if (-not $SkipVerify) {
  & (Join-Path $projectRoot 'verify-install.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Installation verification failed' }
}

$portLine = Get-Content -LiteralPath (Join-Path $projectRoot '.env') | Where-Object { $_ -match '^PORT=' } | Select-Object -Last 1
$port = if ($portLine) { [int](($portLine -split '=', 2)[1]) } else { 3000 }
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  try {
    $health = Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:$port/health" -TimeoutSec 5
    if ($health.ok -eq $true -and $health.service -eq 'nano-banana-service') {
      Write-Host "Service is already running: http://127.0.0.1:$port"
      exit 0
    }
  } catch {}
  throw "Port $port is occupied by process $($listener.OwningProcess)"
}

$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$stdout = Join-Path $projectRoot 'runtime.out.log'
$stderr = Join-Path $projectRoot 'runtime.err.log'
Start-Process -FilePath $npm -ArgumentList 'start' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr

for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:$port/health" -TimeoutSec 2
    if ($health.ok -eq $true -and $health.service -eq 'nano-banana-service') {
      Write-Host "Service started: http://127.0.0.1:$port"
      exit 0
    }
  } catch {}
}
throw "Service did not become healthy. Check $stderr"
