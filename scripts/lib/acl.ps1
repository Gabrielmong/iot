# ACL hardening for the HomeControl service account. Dot-source after common.ps1; do not run.
# SIDs: S-1-5-32-544 Administrators, S-1-5-18 SYSTEM, S-1-5-19 LocalService.

$script:Admins = '*S-1-5-32-544'
$script:System = '*S-1-5-18'
$script:LocalService = '*S-1-5-19'

# Runs icacls without letting per-item errors stop the script. Windows PowerShell 5.1 turns redirected
# native stderr into a terminating error under $ErrorActionPreference='Stop', so this scope uses Continue.
# Returns the exit code and the number of items icacls reported as failed.
function Invoke-IcaclsTolerant([string[]]$Arguments) {
    $ErrorActionPreference = 'Continue'
    $out = & icacls @Arguments 2>&1 | ForEach-Object { "$_" }
    $exitCode = $LASTEXITCODE
    $failedLine = $out | Where-Object { $_ -match 'Failed processing (\d+)' } | Select-Object -Last 1
    $failed = if ($failedLine -and $failedLine -match 'Failed processing (\d+)') { [int]$Matches[1] } else { 0 }
    [pscustomobject]@{ ExitCode = $exitCode; Failed = $failed; Output = $out }
}

# Repo dir: admins and SYSTEM full control, LocalService read+execute, no inherited user write access.
# /C keeps going past unreadable children (long paths etc.); a failed child only warns, a wrong root throws.
function Protect-RepoDirectory([string]$Repo, [switch]$DryRun) {
    $desc = "icacls $Repo /inheritance:r /C (admins/SYSTEM full, LocalService read+execute)"
    if ($DryRun) { Write-Host "[dry-run] $desc"; return }
    Write-Host $desc
    $result = Invoke-IcaclsTolerant @($Repo, '/inheritance:r', '/C', '/grant:r', "$($script:Admins):(OI)(CI)F", "$($script:System):(OI)(CI)F", "$($script:LocalService):(OI)(CI)RX")
    if ($result.ExitCode -ne 0 -or $result.Failed -gt 0) {
        Write-Warning "icacls exit code $($result.ExitCode), $($result.Failed) item(s) failed; checking the repo root ACL next."
    }
    Assert-RepoRootAcl $Repo
}

# Throws unless the repo root grants exactly the intended access.
function Assert-RepoRootAcl([string]$Repo) {
    $rules = (Get-Acl $Repo).Access | ForEach-Object {
        [pscustomobject]@{ Sid = $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value; Rights = $_.FileSystemRights.ToString(); Type = $_.AccessControlType }
    }
    $has = { param($s, $pattern) [bool]($rules | Where-Object { $_.Sid -eq $s -and $_.Type -eq 'Allow' -and $_.Rights -match $pattern }) }
    $problems = @()
    if (-not (& $has 'S-1-5-32-544' 'FullControl')) { $problems += 'Administrators lack full control' }
    if (-not (& $has 'S-1-5-18' 'FullControl')) { $problems += 'SYSTEM lacks full control' }
    if (-not (& $has 'S-1-5-19' 'ReadAndExecute')) { $problems += 'LocalService lacks read+execute' }
    $writers = $rules | Where-Object { $_.Sid -in 'S-1-5-32-545', 'S-1-5-11', 'S-1-1-0' -and $_.Type -eq 'Allow' -and $_.Rights -match 'Write|Modify|FullControl' }
    if ($writers) { $problems += 'Users/Authenticated Users/Everyone still have write access' }
    if ($problems) { throw "Repo root ACL is wrong: $($problems -join '; ')" }
}

# Logs dir: the service must be able to write and rotate its log files. Acts on the folder itself: no /T, no /L.
# icacls then re-propagates the inheritable ACE to existing children, but that propagation stops at a junction (it
# changes the junction's own ACL only and never descends into its target), so a link planted in logs cannot widen
# access elsewhere. Keep it that way: never add /T here.
function Grant-LogsAccess([string]$Logs, [switch]$DryRun) {
    Invoke-Step "icacls $Logs /grant LocalService modify" {
        icacls $Logs /grant "$($script:LocalService):(OI)(CI)M" | Out-Null
    } -DryRun:$DryRun
}

# A folder the service only reads (e.g. the published Android app); inheritable, no /T for the same reason as logs.
function Grant-ReadAccess([string]$Path, [switch]$DryRun) {
    Invoke-Step "icacls $Path /grant LocalService read+execute" {
        $result = Invoke-IcaclsTolerant @($Path, '/grant', "$($script:LocalService):(OI)(CI)RX")
        if ($result.ExitCode -ne 0) { throw "icacls failed (exit code $($result.ExitCode)): $($result.Output -join ' ')" }
    } -DryRun:$DryRun
}

# .env holds secrets: admins, SYSTEM and LocalService only.
function Protect-EnvFile([string]$EnvFile, [switch]$DryRun) {
    Invoke-Step "icacls $EnvFile /inheritance:r (admins/SYSTEM full, LocalService read)" {
        icacls $EnvFile /inheritance:r /grant:r "$($script:Admins):F" "$($script:System):F" "$($script:LocalService):R" | Out-Null
    } -DryRun:$DryRun
}
