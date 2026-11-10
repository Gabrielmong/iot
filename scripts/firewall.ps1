<#
.SYNOPSIS
  Opens the inbound ports Home Control needs, scoped to node.exe (and go2rtc.exe for WebRTC) on the Private profile.
  Idempotent: re-running replaces the rules. Run as Administrator. Use -DryRun to preview.
#>
param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib\common.ps1"
Assert-Admin -DryRun:$DryRun

$node = Get-NodePath
$go2rtc = Join-Path (Resolve-Path "$PSScriptRoot\..").Path 'tools\go2rtc\go2rtc.exe'

# Name, protocol, ports. Replies to our own UDP broadcasts arrive on these ports.
$rules = @(
    @{ Name = 'Home Control web (TCP 4000)';        Protocol = 'TCP'; Ports = @(4000) },
    @{ Name = 'Home Control Tuya (UDP 6666/6667/7000)'; Protocol = 'UDP'; Ports = @(6666, 6667, 7000) },
    @{ Name = 'Home Control Govee replies (UDP 4002)';  Protocol = 'UDP'; Ports = @(4002) },
    # go2rtc WebRTC media: one rule per protocol, sharing a display name, scoped to go2rtc rather than node.
    @{ Name = 'HomeControl go2rtc WebRTC'; Protocol = 'UDP'; Ports = @(8555); Program = $go2rtc },
    @{ Name = 'HomeControl go2rtc WebRTC'; Protocol = 'TCP'; Ports = @(8555); Program = $go2rtc }
)
# Kasa discovery listens on an ephemeral port; Windows allows unicast replies to our own broadcast.
# An earlier version created a UDP 20002 rule that never matched; remove it if present.
$obsolete = 'Home Control Kasa replies (UDP 20002)'
if ($DryRun) { Write-Host "[dry-run] remove obsolete firewall rule '$obsolete' if present" }
else { Get-NetFirewallRule -DisplayName $obsolete -ErrorAction SilentlyContinue | Remove-NetFirewallRule }

# Remove by display name first, so same-named rules (UDP + TCP) are not deleted by each other.
if (-not $DryRun) {
    foreach ($name in ($rules | ForEach-Object { $_.Name } | Select-Object -Unique)) {
        Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    }
}
foreach ($rule in $rules) {
    $name = $rule.Name
    $program = if ($rule.Program) { $rule.Program } else { $node }
    if ($DryRun) {
        Write-Host "[dry-run] firewall rule '$name': inbound $($rule.Protocol) $($rule.Ports -join ',') on Private, program $program"
        continue
    }
    New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Profile Private `
        -Program $program -Protocol $rule.Protocol -LocalPort $rule.Ports | Out-Null
    Write-Host "Created firewall rule '$name' ($($rule.Protocol))"
}
