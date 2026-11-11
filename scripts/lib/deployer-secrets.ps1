# GitHub token, API token and the ACLs that protect them. Dot-source after common.ps1, acl.ps1, deployer-acl.ps1,
# deployer-paths.ps1 and deployer-layout.ps1; do not run.

# Writes $Text to a file that is locked down BEFORE the secret goes in (created empty, ACL'd, then filled).
function Write-SecretFile([string]$Root, [string]$Path, [string]$Text, $Grants) {
    Assert-NoLinkChain $Root $Path
    New-Item -ItemType File -Force $Path | Out-Null
    Set-PathAcl $Path $Grants -File
    [IO.File]::WriteAllText($Path, $Text, [Text.Encoding]::ASCII)
}

function Read-SecretText([string]$Path) { (Get-Content $Path -Raw).Trim() }

# An empty or whitespace-only file (a failed earlier write) counts as missing, so a re-run can retry.
function Test-SecretPresent([string]$Path) { (Test-Path $Path) -and -not [string]::IsNullOrWhiteSpace((Get-Content $Path -Raw)) }

# Asks once; does nothing when the token file exists. Never prompts in a dry run.
function Initialize-GitHubToken([string]$Root, [string]$File, [switch]$DryRun) {
    if (Test-SecretPresent $File) { Write-Host "GitHub token already stored at $File"; return }
    if ($DryRun) { Write-Host "[dry-run] Ask for the GitHub token (Read-Host -AsSecureString) and store it in $File (admins/SYSTEM only)"; return }
    $secure = Read-Host 'GitHub fine-grained token (this repo; Contents, Actions, Metadata: read)' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ([string]::IsNullOrWhiteSpace($plain)) { throw 'No token entered.' }
    Write-SecretFile $Root $File $plain.Trim() (Get-SecretGrants)
    Write-Host "GitHub token stored at $File"
}

# 32 random bytes, base64. The app server (LocalService) must be able to read it.
function Initialize-ApiToken([string]$Root, [string]$File, [switch]$DryRun) {
    if (Test-SecretPresent $File) { Write-Host "API token already exists at $File"; return }
    Invoke-Step "Generate the API token (32 random bytes, base64) in $File (admins/SYSTEM full, LocalService read)" {
        $bytes = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        Write-SecretFile $Root $File ([Convert]::ToBase64String($bytes)) (Get-SecretGrants -LocalServiceRead)
    } -DryRun:$DryRun
}

# Re-applies each existing secret file's explicit ACL (a link at it or at any parent up to <Root> throws; nothing is
# ACL'd through a link). .env gets the same ACL as Protect-EnvFile gives it.
function Protect-SecretFiles($Layout, [switch]$DryRun) {
    if ($DryRun) { Write-Host '[dry-run] Re-lock github-token (admins/SYSTEM), api-token and .env (plus LocalService read) explicitly'; return }
    foreach ($f in Get-SecretFiles $Layout) {
        Assert-NoLinkChain $Layout.Root $f.Path
        if ((Get-PathState $f.Path) -eq 'File') { Set-PathAcl $f.Path (Get-SecretGrants -LocalServiceRead:$f.LocalServiceRead) -File }
    }
}

# For a finally: re-locks the secret files, but a failure here never replaces $Failure (the error that is already
# propagating); it only warns then. Without an earlier error it throws as usual.
function Protect-SecretFilesFinally($Layout, $Failure, [switch]$DryRun) {
    try { Protect-SecretFiles $Layout -DryRun:$DryRun }
    catch { if ($Failure) { Write-Warning "Re-locking the secret files also failed: $($_.Exception.Message)" } else { throw } }
}

function Assert-SecretFiles($Layout) {
    foreach ($f in Get-SecretFiles $Layout) { if ((Get-PathState $f.Path) -eq 'File') { Assert-SecretAcl $f.Path -LocalServiceRead:$f.LocalServiceRead } }
}
