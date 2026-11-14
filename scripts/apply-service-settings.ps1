<#
.SYNOPSIS
  Applies the HomeControl service definition for the deployed layout (<Root>\current junction, <Root>\shared).
  Run by the deployer from the release's own copy of scripts\. Does not start or stop the service.
#>
param(
    [Parameter(Mandatory)][string]$Service,
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$Node,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib\common.ps1"
. "$PSScriptRoot\lib\acl.ps1"
. "$PSScriptRoot\lib\service.ps1"
. "$PSScriptRoot\lib\service-settings.ps1"
Assert-Admin -DryRun:$DryRun
if (-not $DryRun -and -not (Get-Command nssm -ErrorAction SilentlyContinue)) { throw 'nssm was not found. Run: choco install nssm' }
Test-NodeIsSystemWide $Node -DryRun:$DryRun

$current = Join-Path $Root 'current'
$logs = Join-Path $Root 'shared\logs'
$android = Join-Path $Root 'shared\android'
$environment = @(
    'NODE_ENV=production'
    "DOTENV_CONFIG_PATH=$(Join-Path $Root 'shared\.env')"
    "GO2RTC_PATH=$(Join-Path $current 'tools\go2rtc\go2rtc.exe')"
    "FFMPEG_PATH=$(Join-Path $current 'tools\ffmpeg\ffmpeg.exe')"
    "DEPLOYER_TOKEN_FILE=$(Join-Path $Root 'deployer\api-token')"
    "ANDROID_APK_DIR=$android"
    "GO2RTC_PID_FILE=$(Join-Path $logs 'run\go2rtc.pid')"   # shared: a release is read-only, and orphans outlive it
)

if ($DryRun) { Write-Host "[dry-run] Creating $logs" } else { New-Item -ItemType Directory -Force $logs | Out-Null }
Grant-LogsAccess $logs -DryRun:$DryRun
if ($DryRun) { Write-Host "[dry-run] Creating $android" } else { New-Item -ItemType Directory -Force $android | Out-Null }
Grant-ReadAccess $android -DryRun:$DryRun
Install-OrUpdateServiceCommand $Service $Node -DryRun:$DryRun
Set-HomeControlServiceSettings (Get-HomeControlServiceSettings $current $logs $environment) $Service -DryRun:$DryRun
Write-Host "Service settings applied to $Service"
