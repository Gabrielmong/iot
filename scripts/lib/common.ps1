# Shared helpers for the Windows deployment scripts. Dot-source this file; do not run it.

function Test-IsAdmin {
    $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Stops unless running as Administrator. Dry runs change nothing, so they skip the check.
function Assert-Admin([switch]$DryRun) {
    if (-not $DryRun -and -not (Test-IsAdmin)) {
        throw 'Run this script from an elevated (Administrator) PowerShell.'
    }
}

# Runs (or, in a dry run, only prints) one step. Native-command failures stop the script.
function Invoke-Step([string]$Description, [scriptblock]$Action, [switch]$DryRun) {
    if ($DryRun) { Write-Host "[dry-run] $Description"; return }
    Write-Host $Description
    $global:LASTEXITCODE = 0
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "Step failed (exit code $LASTEXITCODE): $Description" }
}

function Get-NodePath {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw 'node was not found on PATH. Install Node 22+ first.' }
    $node.Source
}

# Stops unless node (symlinks resolved) is under Program Files (a dry run only warns). The service runs as
# LocalService, so node must be a system-wide install (official MSI): a per-user one such as nvm exits at once there.
function Test-NodeIsSystemWide([string]$NodePath, [switch]$DryRun) {
    $item = Get-Item $NodePath
    $resolved = if ($item.Target) { @($item.Target)[0] } else { $NodePath }
    $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
    if (-not ($roots | Where-Object { $resolved.StartsWith($_ + '', [StringComparison]::OrdinalIgnoreCase) })) {
        $msg = "node resolves to $resolved, outside Program Files. The service account can't run a per-user Node (nvm, fnm, volta): install Node 22 system-wide (official MSI), open a new shell so ``node`` finds it, and re-run."
        if ($DryRun) { Write-Warning $msg } else { throw $msg }
    }
}
