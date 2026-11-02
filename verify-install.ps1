param(
  [switch]$RequireService,
  [switch]$SkipTests,
  [switch]$CheckProviders
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check([string]$Name, [bool]$Passed, [string]$Detail) {
  $checks.Add([PSCustomObject]@{ Check = $Name; Result = $(if ($Passed) { 'PASS' } else { 'FAIL' }); Detail = $Detail })
}

function Read-DotEnv([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $parts = $line -split '=', 2
    $values[$parts[0].Trim()] = $parts[1].Trim()
  }
  return $values
}

$envValues = Read-DotEnv $envPath
Add-Check 'Version' (Test-Path -LiteralPath (Join-Path $projectRoot 'VERSION')) $(Get-Content (Join-Path $projectRoot 'VERSION') -ErrorAction SilentlyContinue)
Add-Check '.env' (Test-Path -LiteralPath $envPath) $envPath

$required = @('FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_MAIN_APP_TOKEN', 'FEISHU_MAIN_TABLE_ID', 'FEISHU_LIB_APP_TOKEN', 'FEISHU_LIB_TABLE_ID', 'NANO_BASE_URL', 'NANO_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_API_KEY')
$missing = @($required | Where-Object { -not $envValues[$_] -or $envValues[$_] -match '^(your-|sk-xxx|cli_xxx|xxx)' })
Add-Check 'Required config' ($missing.Count -eq 0) $(if ($missing.Count) { 'Missing: ' + ($missing -join ', ') } else { 'Configured' })
$wechatWebhook = $envValues['WECHAT_WEBHOOK']
$wechatConfigured = -not $wechatWebhook -or $wechatWebhook -notmatch 'your-webhook-key|example|replace-with'
Add-Check 'WeChat webhook' $wechatConfigured $(if (-not $wechatWebhook) { 'Disabled' } elseif ($wechatConfigured) { 'Configured' } else { 'Placeholder value' })
Add-Check 'Nano 4K' ($envValues['NANO_IMAGE_SIZE'] -eq '4K') "NANO_IMAGE_SIZE=$($envValues['NANO_IMAGE_SIZE'])"
$invalidUrls = @('NANO_BASE_URL', 'OPENAI_BASE_URL', 'CAPTION_FALLBACK_BASE_URL') | Where-Object {
  if (-not $envValues[$_]) { return $_ -ne 'CAPTION_FALLBACK_BASE_URL' }
  $parsed = $null
  -not [Uri]::TryCreate($envValues[$_], [UriKind]::Absolute, [ref]$parsed) -or $parsed.Scheme -notin @('http', 'https')
}
Add-Check 'Provider URLs' ($invalidUrls.Count -eq 0) $(if ($invalidUrls.Count) { 'Invalid: ' + ($invalidUrls -join ', ') } else { 'Valid absolute URLs' })

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeVersion = if ($nodeCommand) { (& $nodeCommand.Source --version).TrimStart('v') } else { '' }
$nodeSupported = $nodeCommand -and ([version]$nodeVersion).Major -ge 20
Add-Check 'Node.js >= 20' $nodeSupported $(if ($nodeCommand) { "v$nodeVersion" } else { 'Not found' })
Add-Check 'Node modules' (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\sharp\package.json')) 'sharp dependency'

$syntaxPassed = $true
$javascriptFiles = @(
  Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src') -Filter '*.js' -File
  Get-ChildItem -LiteralPath (Join-Path $projectRoot 'scripts') -Filter '*.js' -File
)
foreach ($file in $javascriptFiles) {
  & node --check $file.FullName 2>$null
  if ($LASTEXITCODE -ne 0) { $syntaxPassed = $false }
}
Add-Check 'JavaScript syntax' $syntaxPassed 'All source and script files'

if (-not $SkipTests) {
  Push-Location $projectRoot
  try { & npm.cmd test *> $null } finally { Pop-Location }
  Add-Check 'Automated tests' ($LASTEXITCODE -eq 0) 'npm test'
}

if ($CheckProviders) {
  Push-Location $projectRoot
  try { $providerOutput = @(& node (Join-Path $projectRoot 'scripts\checkProviders.js') 2>&1) } finally { Pop-Location }
  $providerPassed = $LASTEXITCODE -eq 0
  Add-Check 'External providers' $providerPassed $(if ($providerPassed) { 'Feishu fields and caption vision inference' } else { ($providerOutput -join '; ') })
}

if ($RequireService) {
  $parsedPort = 0
  $port = if ([int]::TryParse($envValues['PORT'], [ref]$parsedPort) -and $parsedPort -ge 1 -and $parsedPort -le 65535) { $parsedPort } else { 3000 }
  try {
    $health = Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:$port/health" -TimeoutSec 5
    Add-Check 'Service health' ($health.ok -eq $true -and $health.service -eq 'nano-banana-service') "http://127.0.0.1:$port/health"
  } catch {
    Add-Check 'Service health' $false $_.Exception.Message
  }
}

$checks | Format-Table -AutoSize
if ($checks.Result -contains 'FAIL') { exit 1 }
