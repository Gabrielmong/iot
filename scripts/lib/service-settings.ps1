# The HomeControl service definition, shared by install-service.ps1 and apply-service-settings.ps1.
# Dot-source after common.ps1 and service.ps1; do not run.

# Ordered nssm settings. A value that is an array is multi-valued (see Set-NssmValues).
function Get-HomeControlServiceSettings([string]$AppDirectory, [string]$LogsDir, [string[]]$Environment) {
    $settings = [ordered]@{
        AppDirectory         = $AppDirectory
        ObjectName           = 'NT AUTHORITY\LocalService'
        AppEnvironmentExtra  = @($Environment)
        Start                = 'SERVICE_AUTO_START'
        AppExit              = 'Default Restart'
        AppRestartDelay      = '5000'
        AppStdout            = Join-Path $LogsDir 'home-control.out.log'
        AppStderr            = Join-Path $LogsDir 'home-control.err.log'
        AppRotateFiles       = '1'
        AppRotateOnline      = '1'
        AppRotateBytes       = '5242880'
        AppStopMethodConsole = '15000'   # > the app's 10 s graceful-shutdown timeout
    }
    $pg = Find-PostgresService
    if ($pg) { $settings['DependOnService'] = $pg }
    $settings
}

function Set-HomeControlServiceSettings($Settings, [string]$Service, [switch]$DryRun) {
    foreach ($key in $Settings.Keys) {
        $value = $Settings[$key]
        if ($value -is [array]) { Set-NssmValues $Service $key $value -DryRun:$DryRun }
        else { Set-NssmValue $Service $key $value -DryRun:$DryRun }
    }
}

# Installs the service when missing, otherwise only refreshes its command.
function Install-OrUpdateServiceCommand([string]$Service, [string]$Node, [switch]$DryRun) {
    if (Get-Service $Service -ErrorAction SilentlyContinue) {
        Invoke-Step 'Updating service command' {
            nssm set $Service Application $Node | Out-Null
            if ($LASTEXITCODE -eq 0) { nssm set $Service AppParameters 'apps/server/dist/main.js' | Out-Null }
        } -DryRun:$DryRun
    } else {
        Invoke-Step "Installing service $Service" { nssm install $Service $Node 'apps/server/dist/main.js' | Out-Null } -DryRun:$DryRun
    }
}
