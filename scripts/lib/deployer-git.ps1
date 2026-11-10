# Clone/fetch of the private repo. The token goes to git only through child-only environment config
# (GIT_CONFIG_*, header scoped to https://github.com/; never argv, the remote URL or git config). Dot-source after common.ps1, deployer-paths.ps1 and deployer-secrets.ps1; do not run.

# Git 2.31+ reads GIT_CONFIG_COUNT/KEY_n/VALUE_n from the environment.
function Assert-GitVersion([string]$Git, [switch]$DryRun) {
    if ($DryRun -or -not (Test-Path $Git)) { Write-Warning "Not checking the git version (dry run or git not found); setup needs git 2.31 or newer."; return }
    $text = "$(& $Git --version)"
    if ($text -notmatch '(\d+)\.(\d+)') { throw "Could not read the git version from '$text'." }
    if (([int]$Matches[1] -lt 2) -or ([int]$Matches[1] -eq 2 -and [int]$Matches[2] -lt 31)) {
        throw "git 2.31 or newer is required (the token is passed through GIT_CONFIG_* environment variables); found: $text"
    }
    Write-Host "  git version ok: $text"
}

# Runs $Action with the token in GIT_CONFIG_* env vars (never in argv, the remote URL or git config) and always
# removes them from this session afterwards.
function Invoke-WithGitAuth([string]$TokenFile, [scriptblock]$Action) {
    $names = 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0'
    $saved = @{}
    foreach ($n in $names) { $saved[$n] = [Environment]::GetEnvironmentVariable($n, 'Process') }
    try {
        $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('x-access-token:' + (Read-SecretText $TokenFile)))
        $env:GIT_CONFIG_COUNT = '1'
        $env:GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader'   # sent to github.com only, never to a redirect target
        $env:GIT_CONFIG_VALUE_0 = "Authorization: Basic $basic"
        & $Action
    } finally {
        foreach ($n in $names) { [Environment]::SetEnvironmentVariable($n, $saved[$n], 'Process') }
    }
}

function Sync-DeployerRepo([string]$Git, [string]$GitHubRepo, [string]$Repo, [string]$TokenFile, [switch]$DryRun) {
    $url = "https://github.com/$GitHubRepo.git"
    Assert-NotLink $Repo   # created empty and locked by New-LayoutFolders; clone fills it
    if (Test-Path (Join-Path $Repo '.git')) {
        Invoke-Step "git fetch origin in $Repo (token via GIT_CONFIG_* environment, not argv)" {
            Invoke-WithGitAuth $TokenFile { & $Git -C $Repo fetch --quiet origin }
        } -DryRun:$DryRun
    } else {
        Invoke-Step "git clone $url into $Repo (token via GIT_CONFIG_* environment, not stored)" {
            Invoke-WithGitAuth $TokenFile { & $Git clone --quiet $url $Repo }
        } -DryRun:$DryRun
    }
}

# Tree hash of apps/deployer at origin/main: the deployer compares it to know when the helper itself is stale.
function Get-InstalledDeployerTree([string]$Git, [string]$Repo, [switch]$DryRun) {
    if ($DryRun) { Write-Host "[dry-run] installedDeployerTree = git -C $Repo rev-parse origin/main:apps/deployer"; return '<tree-hash>' }
    $tree = (& $Git -C $Repo rev-parse 'origin/main:apps/deployer')
    if ($LASTEXITCODE -ne 0 -or -not $tree) { throw 'Could not read origin/main:apps/deployer. Is the deployer pushed to main?' }
    "$tree".Trim()
}
