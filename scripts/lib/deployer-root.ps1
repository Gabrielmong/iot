# The deploy root: setup never adopts a pre-existing tree. A missing root is created already locked; an existing one
# must already be a locked HomeControl install or setup stops before writing anything. Dot-source after acl.ps1,
# deployer-native.ps1, deployer-acl.ps1, deployer-paths.ps1 and deployer-layout.ps1; do not run.

# Read-only. $false: <Root> is missing (fresh install). $true: it exists and is a locked install. Otherwise throws.
function Assert-InstallRoot($Layout) {
    $root = $Layout.Root
    $state = Get-PathState $root
    if ($state -eq 'Missing') { return $false }
    try {
        if ($state -ne 'Dir') { throw "$root is a $state, not a real directory" }
        Assert-RootAcl $root
        foreach ($p in Get-LayoutFixedPaths $Layout) { Assert-NotLink $p }
        Assert-CurrentLink $Layout.Current $Layout.Releases
        foreach ($f in Get-LayoutFolders $Layout) {
            $s = Get-PathState $f.Path
            if ($s -eq 'Missing') { continue }
            if ($s -ne 'Dir') { throw "$($f.Path) is a $s, not a directory" }
            if ($f.Private) { Assert-PrivateAcl $f.Path }
        }
        foreach ($f in Get-SecretFiles $Layout) {
            $s = Get-PathState $f.Path
            if ($s -eq 'Missing') { continue }
            if ($s -ne 'File') { throw "$($f.Path) is a $s, not a file" }
            if ($f.Strict) { Assert-SecretAcl $f.Path -LocalServiceRead:$f.LocalServiceRead } else { Assert-AdminOwned $f.Path }
        }
    } catch {
        $why = $_.Exception.Message
        $hint = ''
        if ($why -match 'unexpected access for (S-1-5-21-[\d-]+)') {
            # Explorer's "You don't have permission... Continue" permanently grants the signed-in user Full Control.
            $hint = " A user account has access, usually from clicking Continue in File Explorer. If that was you, remove it with: icacls $root /remove:g *$($Matches[1]) /T /C /Q ; then re-run. Browse $root from an elevated PowerShell instead."
        }
        throw "$root exists but isn't a locked HomeControl install; move it aside and re-run. ($why)$hint"
    }
    $true
}

$script:CreateRaceHook = $null   # test seam: called with the path between the "missing" check and the create

# Creates a directory that is born with its owner and protected DACL (no moment with inherited access). CreateDirectory
# silently returns when the path already exists, so the result is re-read without following links (one handle): it
# must be a real directory, owned by the expected SID, with exactly the intended DACL. A raced path fails this.
function New-LockedDirectory([string]$Path, $Grants) {
    Assert-NotLink $Path
    if ((Get-PathState $Path) -ne 'Missing') { throw "$Path already exists; refusing to adopt it." }
    if ($script:CreateRaceHook) { & $script:CreateRaceHook $Path }
    [IO.Directory]::CreateDirectory($Path, (New-PathSecurity $Grants)) | Out-Null
    $a = Get-AclSnapshot $Path
    if ($a.IsLink -or -not $a.IsDir) { throw "$Path is not the directory this run created (it is a link or a file); refusing it." }
    if ($a.OwnerSid -ne $script:OwnerSid) { throw "$Path is owned by $($a.OwnerSid), not by $($script:OwnerSid): someone else created it first; refusing it." }
    Assert-AclAllowlist $Path $Grants
}

# Fresh root only: created locked before any child exists. Throws (having changed nothing it does not own) when the
# parent is missing or the create was raced.
function New-DeployRoot([string]$Root, [switch]$DryRun) {
    if ((Get-PathState (Split-Path $Root -Parent)) -ne 'Dir') { throw "The parent folder of $Root does not exist (or is a link); create it first." }
    Invoke-Step "Create $Root locked (owner Administrators; protected DACL: admins/SYSTEM full, LocalService read+execute, (OI)(CI))" {
        New-LockedDirectory $Root (Get-RootGrants)
    } -DryRun:$DryRun
}

# The fixed folders, each created by this (elevated) process under the locked root; existing ones were checked by
# Assert-InstallRoot and are left as they are. Returns the paths this run created (in a dry run: would create).
function New-LayoutFolders($Layout, [switch]$DryRun) {
    $created = @()
    foreach ($f in Get-LayoutFolders $Layout) {
        Assert-NoLinkChain $Layout.Root $f.Path
        if ((Get-PathState $f.Path) -ne 'Missing') { continue }
        if ($f.Private) {
            Invoke-Step "Create $($f.Path) locked (admins/SYSTEM only)" { New-LockedDirectory $f.Path (Get-PrivateGrants) } -DryRun:$DryRun
        } else {
            Invoke-Step "Create $($f.Path)" { New-Item -ItemType Directory $f.Path | Out-Null } -DryRun:$DryRun
        }
        $created += $f.Path
    }
    $created
}

# Each existing release gets what protect-release.ps1 applies (same function); links in releases\ are skipped.
function Restore-ReleaseLocks([string]$Releases, [switch]$DryRun) {
    Assert-NotLink $Releases
    if ($DryRun) { Write-Host "[dry-run] Re-lock each existing release in $Releases (admins/SYSTEM full, LocalService read+execute)"; return }
    if ((Get-PathState $Releases) -ne 'Dir') { return }
    foreach ($rel in Get-ChildItem -LiteralPath $Releases -Directory -Force | Where-Object { -not (Test-IsLink $_.FullName) }) { Protect-RepoDirectory $rel.FullName }
}
