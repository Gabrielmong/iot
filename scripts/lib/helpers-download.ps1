# Downloads the pinned go2rtc and ffmpeg binaries into <repo>\tools. Dot-source after common.ps1; do not run.
# Hashes are SHA-256 of the release archives (go2rtc: published by GitHub; ffmpeg: GitHub asset digest).
# go2rtc must be >= 1.9.12 (the generated config uses local_auth).

$script:Helpers = @(
    @{
        Name = 'go2rtc 1.9.15'; Dir = 'go2rtc'; Exe = 'go2rtc.exe'
        Url = 'https://github.com/AlexxIT/go2rtc/releases/download/v1.9.15/go2rtc_win64.zip'
        Sha256 = '5b448fc90f15c925406d8da0984301985e385050222c1c2bbdf0a76fe4b1e9cb'
    },
    @{
        Name = 'ffmpeg 9.0.2 (essentials)'; Dir = 'ffmpeg'; Exe = 'ffmpeg.exe'
        Url = 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip'
        Sha256 = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba'
    }
)

# Records which archive an install came from, so a re-run can tell it is current without downloading.
function Test-HelperCurrent($Helper, [string]$Target) {
    $marker = Join-Path $Target 'archive.sha256'
    (Test-Path (Join-Path $Target $Helper.Exe)) -and (Test-Path $marker) -and ((Get-Content $marker -Raw).Trim() -eq $Helper.Sha256)
}

function Get-FileSha256([string]$Path) { (Get-FileHash $Path -Algorithm SHA256).Hash.ToLowerInvariant() }

function New-TempDir([string]$Prefix) {
    $dir = Join-Path ([IO.Path]::GetTempPath()) ($Prefix + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force $dir | Out-Null
    $dir
}

# Downloads the archive to $ZipPath and throws unless it matches the SHA-256 pinned in this file.
function Get-VerifiedArchive($Helper, [string]$ZipPath) {
    Write-Host "Downloading $($Helper.Name)"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $Helper.Url -OutFile $ZipPath -UseBasicParsing
    $actual = Get-FileSha256 $ZipPath
    if ($actual -ne $Helper.Sha256) { throw "SHA-256 mismatch for $($Helper.Name): expected $($Helper.Sha256), got $actual" }
}

# Extracts the helper's exe from an already verified archive to $DestDir\<exe>.
function Expand-HelperExe($Helper, [string]$ZipPath, [string]$DestDir) {
    $work = New-TempDir 'helper-x-'
    try {
        Expand-Archive $ZipPath -DestinationPath $work -Force
        $exe = Get-ChildItem $work -Recurse -Filter $Helper.Exe | Select-Object -First 1
        if (-not $exe) { throw "$($Helper.Exe) not found in the $($Helper.Name) archive" }
        New-Item -ItemType Directory -Force $DestDir | Out-Null
        Copy-Item $exe.FullName (Join-Path $DestDir $Helper.Exe) -Force
    } finally { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
}

# Downloads, verifies and extracts without caching (the repo-root tools\ install).
function Save-HelperExe($Helper, [string]$DestDir) {
    $work = New-TempDir 'helper-'
    try {
        $zip = Join-Path $work 'download.zip'
        Get-VerifiedArchive $Helper $zip
        Expand-HelperExe $Helper $zip $DestDir
    } finally { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
}

# The cache holds the verified ARCHIVE at <CacheDir>\<sha256>\<file name>; its trust anchor is the hash pinned
# in this file, so the cached archive is re-hashed on every use.
function Get-CachedArchive($Helper, [string]$CacheDir) {
    $entry = Join-Path $CacheDir $Helper.Sha256
    $archive = Join-Path $entry ([IO.Path]::GetFileName($Helper.Url))
    if ((Test-Path $archive) -and ((Get-FileSha256 $archive) -eq $Helper.Sha256)) { Write-Host "Using cached $($Helper.Name)"; return $archive }
    if (Test-Path $entry) { Write-Warning "Cache entry for $($Helper.Name) failed verification; discarding it."; Remove-Item $entry -Recurse -Force }
    $work = New-TempDir 'helper-dl-'
    try {
        $tmp = Join-Path $work 'download.zip'
        Get-VerifiedArchive $Helper $tmp
        New-Item -ItemType Directory -Force $entry | Out-Null
        Move-Item $tmp $archive -Force   # only after verification, so a partial file is never at the cache path
    } finally { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
    Write-Host "Cached $($Helper.Name) (SHA-256 verified)"
    $archive
}

function Install-Helper($Helper, [string]$ToolsDir, [string]$CacheDir = '') {
    $target = Join-Path $ToolsDir $Helper.Dir
    if (Test-HelperCurrent $Helper $target) { Write-Host "$($Helper.Name) already installed"; return }
    if ($CacheDir) { Expand-HelperExe $Helper (Get-CachedArchive $Helper $CacheDir) $target }
    else { Save-HelperExe $Helper $target }
    Set-Content (Join-Path $target 'archive.sha256') $Helper.Sha256
    Write-Host "Installed $($Helper.Name) into $target"
}

# Idempotent; throws on a download or hash failure. The repo-root ACL (inherited by tools\) already
# gives LocalService read+execute, so no extra rule is needed.
function Install-Helpers([string]$RepoRoot, [switch]$DryRun) {
    $tools = Join-Path $RepoRoot 'tools'
    foreach ($helper in $script:Helpers) {
        if ($DryRun) { Write-Host "[dry-run] install $($helper.Name) into $tools\$($helper.Dir) (verify SHA-256 $($helper.Sha256))"; continue }
        Install-Helper $helper $tools
    }
}

# Per-release variant: installs into <Target>\<Dir>\ from the shared cache (downloading on a miss).
function Install-HelpersFromCache([string]$Target, [string]$Cache, [switch]$DryRun) {
    foreach ($helper in $script:Helpers) {
        if ($DryRun) { Write-Host "[dry-run] install $($helper.Name) into $Target\$($helper.Dir) from cache $Cache\$($helper.Sha256) (download + verify SHA-256 on a miss)"; continue }
        Install-Helper $helper $Target $Cache
    }
}
