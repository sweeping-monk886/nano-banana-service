param(
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $OutputPath) { $OutputPath = Join-Path $projectRoot "diagnostics-$stamp.zip" }
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "nano-diagnostics-$stamp"
[IO.Directory]::CreateDirectory($tempRoot) | Out-Null
try {
  Get-Content -LiteralPath (Join-Path $projectRoot '.env') | ForEach-Object {
    if ($_ -match '^(.*(?:SECRET|API_KEY).*)=') { ($_.Split('=', 2)[0] + '=<redacted>') } else { $_ }
  } | Set-Content -LiteralPath (Join-Path $tempRoot 'env-redacted.txt') -Encoding UTF8
  Get-Content -LiteralPath (Join-Path $projectRoot 'VERSION') -ErrorAction SilentlyContinue | Set-Content -LiteralPath (Join-Path $tempRoot 'version.txt') -Encoding UTF8
  foreach ($log in @('runtime.out.log', 'runtime.err.log')) {
    $source = Join-Path $projectRoot $log
    if (Test-Path -LiteralPath $source) { Get-Content -LiteralPath $source -Tail 500 | Set-Content -LiteralPath (Join-Path $tempRoot $log) -Encoding UTF8 }
  }
  & (Join-Path $projectRoot 'verify-install.ps1') *>&1 | Set-Content -LiteralPath (Join-Path $tempRoot 'verification.txt') -Encoding UTF8
  Compress-Archive -Path (Join-Path $tempRoot '*') -DestinationPath $OutputPath -Force
  Write-Host "Diagnostics created: $OutputPath"
} finally {
  if (Test-Path -LiteralPath $tempRoot) { [IO.Directory]::Delete($tempRoot, $true) }
}
