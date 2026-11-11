# deployer.json, the helper's own build, and the HomeDeployer NSSM service. Dot-source after common.ps1,
# service.ps1, helpers-download.ps1 (New-TempDir) and deployer-paths.ps1; do not run.

function Write-DeployerConfig($Layout, [string]$GitHubRepo, $Bins, [string]$Tree, [switch]$DryRun) {
    $config = [ordered]@{
        root = $Layout.Root; githubRepo = $GitHubRepo
        tokenFile = $Layout.GitHubToken; apiTokenFile = $Layout.ApiToken
        bin = $Bins; installedDeployerTree = $Tree
    }
    $json = $config | ConvertTo-Json -Depth 4
    Assert-NotLink $Layout.Config
    Invoke-Step "Write $($Layout.Config)" {
        # No BOM: JSON.parse rejects one.
        [IO.File]::WriteAllText($Layout.Config, $json, [Text.UTF8Encoding]::new($false))
        $global:LASTEXITCODE = 0
    } -DryRun:$DryRun
    if ($DryRun) { Write-Host $json }
}

# Fresh export of origin/main -> install -> build -> pnpm deploy --prod into deployer\app.
function Install-DeployerApp($Layout, $Bins, [switch]$DryRun) {
    $work = Join-Path ([IO.Path]::GetTempPath()) 'deployer-export-<random>'
    $app = $Layout.App
    $git = $Bins.git
    Assert-NotLink $app
    if (-not $DryRun) { $work = New-TempDir 'deployer-export-' }
    try {
        Invoke-Step "Export origin/main from $($Layout.Repo) to $work" {
            $tar = Join-Path $work 'src.tar'
            & $git -C $Layout.Repo archive --format=tar -o $tar origin/main
            if ($LASTEXITCODE -eq 0) { & $Bins.tar -xf $tar -C $work }
        } -DryRun:$DryRun
        Invoke-Step 'pnpm install --frozen-lockfile (deployer only, shared store, copy)' {
            & $Bins.pnpm --dir $work --filter '@home/deployer...' install --frozen-lockfile --store-dir $Layout.PnpmStore --config.package-import-method=copy
        } -DryRun:$DryRun
        Invoke-Step 'pnpm --filter @home/deployer build' { & $Bins.pnpm --dir $work --filter '@home/deployer' build } -DryRun:$DryRun
        Invoke-Step "Replace $app with pnpm --filter @home/deployer deploy --prod" {
            if (Test-Path $app) { Remove-Item $app -Recurse -Force }
            & $Bins.pnpm --dir $work --filter '@home/deployer' deploy --prod $app
            if ($LASTEXITCODE -eq 0 -and -not (Test-Path (Join-Path $app 'dist\main.js'))) {
                Copy-Item (Join-Path $work 'apps\deployer\dist') (Join-Path $app 'dist') -Recurse   # deploy omitted the build output
            }
            if ($LASTEXITCODE -eq 0 -and -not (Test-Path (Join-Path $app 'dist\main.js'))) { throw "$app\dist\main.js is missing after pnpm deploy" }
        } -DryRun:$DryRun
    } finally { if (-not $DryRun) { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue } }
}

# LocalSystem service running node deployer\app\dist\main.js <config>; the caller has checked the paths have no spaces.
function Install-DeployerService([string]$Service, $Layout, [string]$Node, [switch]$DryRun) {
    $params = "$(Join-Path $Layout.App 'dist\main.js') $($Layout.Config)"
    if (Get-Service $Service -ErrorAction SilentlyContinue) {
        Invoke-Step "Updating service $Service" {
            nssm set $Service Application $Node | Out-Null
            if ($LASTEXITCODE -eq 0) { nssm set $Service AppParameters $params | Out-Null }
        } -DryRun:$DryRun
    } else {
        Invoke-Step "Installing service $Service (node $params)" { nssm install $Service $Node $params | Out-Null } -DryRun:$DryRun
    }
    $settings = [ordered]@{
        AppDirectory = $Layout.App; ObjectName = 'LocalSystem'; Start = 'SERVICE_AUTO_START'
        AppExit = @('Default', 'Restart'); AppRestartDelay = '5000'
        AppStdout = Join-Path $Layout.Data 'service.out.log'; AppStderr = Join-Path $Layout.Data 'service.err.log'
        AppRotateFiles = '1'; AppRotateOnline = '1'; AppRotateBytes = '5242880'
        AppStopMethodConsole = '660000'   # the helper finishes the running operation (up to 10 min) before exiting
    }
    foreach ($key in $settings.Keys) {
        $value = $settings[$key]
        if ($value -is [array]) { Set-NssmValues $Service $key $value -DryRun:$DryRun }
        else { Set-NssmValue $Service $key $value -DryRun:$DryRun }
    }
}
