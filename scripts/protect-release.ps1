<#
.SYNOPSIS
  Locks a release directory down: admins/SYSTEM full control, LocalService read+execute.
#>
param(
    [Parameter(Mandatory)][string]$Path,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib\common.ps1"
. "$PSScriptRoot\lib\acl.ps1"
Assert-Admin -DryRun:$DryRun
Protect-RepoDirectory $Path -DryRun:$DryRun
Write-Host "Protected $Path"
