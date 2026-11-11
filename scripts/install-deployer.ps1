<#
.SYNOPSIS
  Installs or updates the deploy helper (NSSM service "HomeDeployer", LocalSystem) under <Root>.
  Run as Administrator; re-runnable. Use -DryRun to preview (no prompt, no changes).
  <Root> must be missing (it is created locked) or a locked install from an earlier run; anything else is refused.
.EXAMPLE
  .\scripts\install-deployer.ps1 -Root C:\HomeControl -GitHubRepo owner/name -From C:\home-control
.NOTES
  The first helper tick deploys the newest green commit and repoints HomeControl to <Root>\current; until then
  the old install (-From) keeps running.
#>
param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$GitHubRepo,
    [string]$From,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib\common.ps1"
. "$PSScriptRoot\lib\acl.ps1"
. "$PSScriptRoot\lib\service.ps1"
. "$PSScriptRoot\lib\helpers-download.ps1"
. "$PSScriptRoot\lib\deployer-bins.ps1"
. "$PSScriptRoot\lib\deployer-native.ps1"
. "$PSScriptRoot\lib\deployer-acl.ps1"
. "$PSScriptRoot\lib\deployer-paths.ps1"
. "$PSScriptRoot\lib\deployer-layout.ps1"
. "$PSScriptRoot\lib\deployer-root.ps1"
. "$PSScriptRoot\lib\deployer-secrets.ps1"
. "$PSScriptRoot\lib\deployer-git.ps1"
. "$PSScriptRoot\lib\deployer-app.ps1"
Assert-Admin -DryRun:$DryRun

if ($GitHubRepo -notmatch '^[\w.-]+/[\w.-]+$') { throw "-GitHubRepo must look like owner/name, got '$GitHubRepo'." }
if ($Root -match '\s') { throw "-Root must not contain spaces (the service command line is not quoted): '$Root'." }
$Root = Get-FullPath $Root
$service = 'HomeDeployer'
$layout = Get-DeployerLayout $Root

Write-Host '== 0. Stop the helper if it is running (setup replaces it)'
Stop-ServiceIfRunning $service -TimeoutSeconds 700 -DryRun:$DryRun

Write-Host '== 1a. Root check (read-only: a missing root is created locked; an existing one must be a locked install)'
$rootExists = Assert-InstallRoot $layout
Write-Host '== 1b. Root'
# Outside the try: if creating the root fails or is raced, nothing is touched (not even the secret re-lock below).
if ($rootExists) { Write-Host "$Root is a locked HomeControl install (root, private folders and secret files checked); updating it" }
else { New-DeployRoot $Root -DryRun:$DryRun }

$failure = $null
try {
    Write-Host '== 1c. Layout folders (private ones are created locked)'
    New-LayoutFolders $layout -DryRun:$DryRun | Out-Null

    Write-Host '== 2. GitHub token'
    Initialize-GitHubToken $Root $layout.GitHubToken -DryRun:$DryRun

    Write-Host '== 3. Repo clone (tool paths first)'
    $bins = Get-DeployerBins -DryRun:$DryRun
    Assert-GitVersion $bins.git -DryRun:$DryRun
    Sync-DeployerRepo $bins.git $GitHubRepo $layout.Repo $layout.GitHubToken -DryRun:$DryRun

    Write-Host '== 4. API token'
    Initialize-ApiToken $Root $layout.ApiToken -DryRun:$DryRun

    Write-Host '== 5. Copy .env from the existing install'
    Copy-FromExistingInstall $From $layout -DryRun:$DryRun

    Write-Host '== 6-7. deployer.json'
    if (-not $DryRun) { Test-NodeIsSystemWide $bins.node; Assert-NodeVersion $bins.node }
    $tree = Get-InstalledDeployerTree $bins.git $layout.Repo -DryRun:$DryRun
    Write-DeployerConfig $layout $GitHubRepo $bins $tree -DryRun:$DryRun

    Write-Host '== 8. Build and install the helper'
    Install-DeployerApp $layout $bins -DryRun:$DryRun

    Write-Host '== 9. ACLs (logs, .env, releases)'
    Assert-NoLinkChain $Root $layout.Logs; Assert-NoLinkChain $Root $layout.EnvFile
    Grant-LogsAccess $layout.Logs -DryRun:$DryRun
    if ($DryRun -or (Test-Path $layout.EnvFile)) { Protect-EnvFile $layout.EnvFile -DryRun:$DryRun }
    else { Write-Warning "No $($layout.EnvFile) yet: create it, then re-run this script so it gets its permissions." }
    Restore-ReleaseLocks $layout.Releases -DryRun:$DryRun
} catch {
    $failure = $_
    throw
} finally {
    # The secret files keep their explicit ACL whatever happened above; a failure here never hides the first error.
    Protect-SecretFilesFinally $layout $failure -DryRun:$DryRun
}
if (-not $DryRun) { Assert-SecretFiles $layout }

Write-Host '== 10. Service'
Install-DeployerService $service $layout $bins.node -DryRun:$DryRun
Start-ServiceAndWait $service 30 -DryRun:$DryRun
if (-not $DryRun) { Get-Service $service }
Write-Host "Done. The first tick deploys the newest green commit. Until it succeeds the Deploys page says the helper isn't running; watch $(Join-Path $Root 'deployer\service.out.log') and $(Join-Path $Root 'deployer\logs')."
