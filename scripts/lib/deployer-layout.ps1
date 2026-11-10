# Folder layout (mirrors pathsFor in apps/deployer/src/config.ts) and the shared\ copy. Dot-source after common.ps1,
# deployer-paths.ps1 and acl.ps1 (Protect-EnvFile); do not run.

function Get-DeployerLayout([string]$Root) {
    $shared = Join-Path $Root 'shared'
    $data = Join-Path $Root 'deployer'
    [ordered]@{
        Root = $Root; Repo = Join-Path $Root 'repo'; Releases = Join-Path $Root 'releases'; Current = Join-Path $Root 'current'
        Shared = $shared; EnvFile = Join-Path $shared '.env'; Logs = Join-Path $shared 'logs'
        ToolsCache = Join-Path $shared 'tools-cache'; PnpmStore = Join-Path $shared 'pnpm-store'
        Data = $data; EventLogs = Join-Path $data 'logs'; Backups = Join-Path $data 'backups'
        App = Join-Path $data 'app'; Config = Join-Path $data 'deployer.json'
        GitHubToken = Join-Path $data 'github-token'; ApiToken = Join-Path $data 'api-token'
        ServiceOut = Join-Path $data 'service.out.log'; ServiceErr = Join-Path $data 'service.err.log'
    }
}

# Folders setup creates, parents first. Private ones get the Administrators/SYSTEM-only DACL when they are created.
function Get-LayoutFolders($Layout) {
    @(
        @{ Path = $Layout.Releases; Private = $false }, @{ Path = $Layout.Shared; Private = $false }
        @{ Path = $Layout.Logs; Private = $false }, @{ Path = $Layout.ToolsCache; Private = $true }
        @{ Path = $Layout.PnpmStore; Private = $true }, @{ Path = $Layout.Data; Private = $true }
        @{ Path = $Layout.EventLogs; Private = $false }, @{ Path = $Layout.Backups; Private = $false }
        @{ Path = $Layout.Repo; Private = $true }
    )
}

# Secret files and whether LocalService may read them. Strict: written only by setup, so on a re-run its ACL must
# already be exact. .env is not strict: an admin may create or replace it (step 9 says so); setup then re-locks it.
function Get-SecretFiles($Layout) {
    @(
        @{ Path = $Layout.GitHubToken; LocalServiceRead = $false; Strict = $true }
        @{ Path = $Layout.ApiToken; LocalServiceRead = $true; Strict = $true }
        @{ Path = $Layout.EnvFile; LocalServiceRead = $true; Strict = $false }
    )
}

# Every fixed path setup creates, writes or ACLs (except `current`, which has its own rule): none may be a link.
function Get-LayoutFixedPaths($Layout) {
    @((Get-LayoutFolders $Layout) | ForEach-Object { $_.Path }) + @((Get-SecretFiles $Layout) | ForEach-Object { $_.Path }) +
        @($Layout.App, $Layout.Config, $Layout.ServiceOut, $Layout.ServiceErr)
}

# Copies .env from the existing install when shared\ has none. Old logs are never copied: the old logs\ folder is
# writable by LocalService, so an elevated copy could be tricked (link swapped in mid-copy) into copying admin-only
# files such as deployer\github-token into the LocalService-readable shared\logs. They stay in the old folder.
# The old .env is only readable by LocalService (Protect-EnvFile), so it cannot be swapped.
function Copy-FromExistingInstall([string]$From, $Layout, [switch]$DryRun) {
    if (-not $From) { Write-Host 'No -From given: not copying .env from an existing install.'; return }
    Assert-NoLinkChain $Layout.Root $Layout.EnvFile
    $srcEnv = Join-Path $From '.env'
    if (Test-Path -LiteralPath $Layout.EnvFile) { Write-Host "$($Layout.EnvFile) already exists; not copying .env" }
    elseif ((Get-PathState $srcEnv) -eq 'File') {
        Invoke-Step "Copy $srcEnv to $($Layout.EnvFile)" { Copy-Item -LiteralPath $srcEnv $Layout.EnvFile; $global:LASTEXITCODE = 0 } -DryRun:$DryRun
        Protect-EnvFile $Layout.EnvFile -DryRun:$DryRun
    }
    else { Write-Warning "No .env file at $srcEnv; create $($Layout.EnvFile) before the first deploy." }
    Write-Host "Old logs are not copied; they stay in $(Join-Path $From 'logs')."
}
