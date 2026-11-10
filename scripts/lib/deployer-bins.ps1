# Resolves the absolute tool paths written into deployer.json. Dot-source after common.ps1; do not run.

# Absolute path of a command, or $null. Application type skips pnpm.ps1 shims and aliases.
function Find-Bin([string]$Name) {
    $cmd = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { $cmd.Source } else { $null }
}

# pg_dump.exe next to the Postgres service's own binaries (its PathName is "<bin>\pg_ctl.exe" runservice ...).
function Find-PgDump {
    $svc = Get-CimInstance Win32_Service -Filter "Name LIKE 'postgresql%'" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($svc -and $svc.PathName -match '^"?([^"]+?)\\[^\\"]+\.exe') {
        $candidate = Join-Path $Matches[1] 'pg_dump.exe'
        if (Test-Path $candidate) { return $candidate }
    }
    Find-Bin 'pg_dump'
}

# The path with every linked folder on the way resolved (nvm-style C:\nvm4w\nodejs links into a profile).
function Resolve-LinkedPath([string]$Path) {
    $parts = $Path.TrimEnd('\') -split '\\'
    $current = $parts[0] + '\'
    foreach ($part in ($parts | Select-Object -Skip 1)) {
        $current = Join-Path $current $part
        $item = Get-Item -LiteralPath $current -Force -ErrorAction SilentlyContinue
        if ($item -and $item.LinkType -and $item.Target) {
            $target = @($item.Target)[0]
            if (-not [IO.Path]::IsPathRooted($target)) { $target = Join-Path (Split-Path $current) $target }
            $current = $target
        }
    }
    $current
}

# pnpm and git run as LocalSystem on every deploy: refuse a copy inside a user profile
# (%APPDATA%, %LOCALAPPDATA%, C:\Users\), which that user could replace. Only warns in a dry run.
function Assert-BinIsSystemWide([string]$Name, [string]$Path, [switch]$DryRun) {
    $resolved = Resolve-LinkedPath $Path
    $userRoots = @($env:APPDATA, $env:LOCALAPPDATA, (Join-Path $env:SystemDrive 'Users')) | Where-Object { $_ }
    $inProfile = $userRoots | Where-Object { $resolved.StartsWith($_.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) }
    if (-not $inProfile) { return }
    $msg = "$Name resolves to $resolved, inside a user profile. The helper runs it as LocalSystem on every deploy; install it system-wide (for example under Program Files) and re-run."
    if (-not $DryRun) { throw $msg }
    Write-Warning "$msg (dry run: continuing)"
}

# Name -> absolute path for every tool the deployer runs. A missing one throws, except in a dry run (placeholder).
function Get-DeployerBins([switch]$DryRun) {
    $found = [ordered]@{
        node       = Find-Bin 'node'
        pnpm       = Find-Bin 'pnpm'
        git        = Find-Bin 'git'
        nssm       = Find-Bin 'nssm'
        pgDump     = Find-PgDump
        powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        tar        = Join-Path $env:SystemRoot 'System32\tar.exe'
    }
    foreach ($name in @($found.Keys)) {
        $path = $found[$name]
        if ($path -and (Test-Path $path)) {
            Write-Host ("  {0,-10} {1}" -f $name, $path)
            if ($name -in 'pnpm', 'git') { Assert-BinIsSystemWide $name $path -DryRun:$DryRun }
            continue
        }
        $hint = switch ($name) { 'nssm' { ' (choco install nssm)' } 'pgDump' { ' (is PostgreSQL installed?)' } default { '' } }
        $msg = "$name was not found$hint"
        if (-not $DryRun) { throw $msg }
        Write-Warning "$msg; using a placeholder in this dry run."
        $found[$name] = "<$name>"
    }
    $found
}
