<#
.SYNOPSIS
  Builds Home Control, migrates the database, and installs or updates the NSSM service "HomeControl".
  Run as Administrator; re-running updates the existing service. Use -DryRun to preview.
.NOTES
  Configuration comes from <repo>\.env, which the app loads itself (dotenv) because AppDirectory is the repo root.
  The service runs as LocalService; the repo is locked down so only administrators can change what it executes.
#>
param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib\common.ps1"
. "$PSScriptRoot\lib\acl.ps1"
. "$PSScriptRoot\lib\service.ps1"
. "$PSScriptRoot\lib\service-settings.ps1"
. "$PSScriptRoot\lib\helpers-download.ps1"
Assert-Admin -DryRun:$DryRun

$serviceName = 'HomeControl'
$repo = (Resolve-Path "$PSScriptRoot\..").Path
$logs = Join-Path $repo 'logs'
$envFile = Join-Path $repo '.env'
$node = Get-NodePath
Test-NodeIsSystemWide $node -DryRun:$DryRun

# Deploys go through HomeDeployer once it exists; running this script would fight it over the service.
if (Get-Service HomeDeployer -ErrorAction SilentlyContinue) {
    $msg = 'HomeDeployer is installed: deploy from the Deploys page, or run ''nssm remove HomeDeployer confirm'' first (see Deploy without the helper in docs\RUNNING.md).'
    if ($DryRun) { Write-Warning $msg } else { throw $msg }
}

if (-not (Test-Path $envFile)) {
    $msg = "Missing $envFile - see docs\RUNNING.md."
    if ($DryRun) { Write-Warning $msg } else { throw $msg }
}
if (-not $DryRun -and -not (Get-Command nssm -ErrorAction SilentlyContinue)) { throw 'nssm was not found. Run: choco install nssm' }

# Remember the starting state so a failure message can say what was actually left behind.
$before = Get-Service $serviceName -ErrorAction SilentlyContinue
$wasRunning = [bool]($before -and $before.Status -ne 'Stopped')

# Stop first so the build and migration never run under a live service.
Stop-ServiceIfRunning $serviceName -DryRun:$DryRun

Push-Location $repo
try {
    # Copy instead of hardlink: hardlinked store files share one ACL, which the lock-down below would rewrite.
    Invoke-Step 'Installing dependencies' { pnpm install --frozen-lockfile --config.package-import-method=copy } -DryRun:$DryRun
    Install-Helpers $repo -DryRun:$DryRun
    Invoke-Step 'Building (protocols, server, web)' { pnpm build } -DryRun:$DryRun
    Invoke-Step 'Applying database migrations' { pnpm db:deploy } -DryRun:$DryRun
    if ($DryRun) { Write-Host "[dry-run] Creating $logs" } else { New-Item -ItemType Directory -Force $logs | Out-Null }
    Protect-RepoDirectory $repo -DryRun:$DryRun
    Grant-LogsAccess $logs -DryRun:$DryRun
    if (Test-Path $envFile) { Protect-EnvFile $envFile -DryRun:$DryRun }
} catch {
    Write-Warning "Update failed: $($_.Exception.Message)"
    if ($wasRunning) { Write-Warning "$serviceName is STOPPED. The failed step may already have replaced the build or migrated the database, so fix the problem and re-run this script; to start the service as it is now: nssm start $serviceName" }
    elseif ($before) { Write-Warning "$serviceName was not running before this run and was left stopped." }
    else { Write-Warning "No $serviceName service was installed yet. Fix the problem above and re-run this script." }
    throw
} finally { Pop-Location }

Install-OrUpdateServiceCommand $serviceName $node -DryRun:$DryRun

# NODE_ENV=production makes the server serve the built web app.
Set-HomeControlServiceSettings (Get-HomeControlServiceSettings $repo $logs @('NODE_ENV=production')) $serviceName -DryRun:$DryRun

Start-ServiceAndWait $serviceName -DryRun:$DryRun
if (-not $DryRun) { Get-Service $serviceName }
