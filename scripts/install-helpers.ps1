<#
.SYNOPSIS
  Installs go2rtc and ffmpeg into <Target>, copying from the SHA-256-keyed cache or downloading into it on a miss.
#>
param(
    [Parameter(Mandatory)][string]$Target,
    [Parameter(Mandatory)][string]$Cache,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib\common.ps1"
. "$PSScriptRoot\lib\helpers-download.ps1"
Install-HelpersFromCache $Target $Cache -DryRun:$DryRun
