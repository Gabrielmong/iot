# ACL primitives for the deployer layout. Dot-source after common.ps1, acl.ps1 and deployer-native.ps1; do not run.
# A descriptor is always written whole (owner + protected DACL in one call), so explicit ACEs of other SIDs cannot
# survive and a path is never momentarily open.

$script:OwnerSid = 'S-1-5-32-544'   # Administrators (a test may override it with its own SID)
$script:SystemSid = 'S-1-5-18'
$script:LocalServiceSid = 'S-1-5-19'
$script:SynchronizeBit = 0x100000    # added by Windows to most grants; carries no access of its own

function New-Grant([string]$Sid, [Security.AccessControl.FileSystemRights]$Rights) { @{ Sid = $Sid; Rights = $Rights } }

function Get-PrivateGrants { @((New-Grant $script:OwnerSid 'FullControl'), (New-Grant $script:SystemSid 'FullControl')) }
function Get-RootGrants { (Get-PrivateGrants) + (New-Grant $script:LocalServiceSid 'ReadAndExecute') }
# Secret files: private, plus LocalService read where the app server needs it (api-token, .env).
function Get-SecretGrants([switch]$LocalServiceRead) {
    if ($LocalServiceRead) { (Get-PrivateGrants) + (New-Grant $script:LocalServiceSid 'Read') } else { Get-PrivateGrants }
}

# Owner = $script:OwnerSid, inheritance cut, exactly the given ACEs ((OI)(CI) on a directory).
function New-PathSecurity($Grants, [switch]$File) {
    $acl = if ($File) { New-Object Security.AccessControl.FileSecurity } else { New-Object Security.AccessControl.DirectorySecurity }
    $acl.SetOwner([Security.Principal.SecurityIdentifier]$script:OwnerSid)
    $acl.SetAccessRuleProtection($true, $false)
    $inherit = if ($File) { 'None' } else { 'ContainerInherit, ObjectInherit' }
    foreach ($g in $Grants) {
        $sid = [Security.Principal.SecurityIdentifier]$g.Sid
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid, $g.Rights, $inherit, 'None', 'Allow')))
    }
    $acl
}

# SetAccessControl writes only the owner and DACL sections; Set-Acl would also touch the SACL (needs SeSecurityPrivilege).
function Set-PathAcl([string]$Path, $Grants, [switch]$File) {
    $acl = New-PathSecurity $Grants -File:$File
    if ($File) { (New-Object IO.FileInfo $Path).SetAccessControl($acl) } else { (New-Object IO.DirectoryInfo $Path).SetAccessControl($acl) }
}

# Owner, DACL and attributes of the path itself, read without following a link (deployer-native.ps1).
function Get-AclSnapshot([string]$Path) {
    $info = [HcNoFollow]::Read($Path)
    if (-not $info) { throw "$Path does not exist" }
    $sd = [Security.AccessControl.RawSecurityDescriptor]::new($info.Descriptor, 0)
    $allow = @(foreach ($ace in @($sd.DiscretionaryAcl)) {
        if ($ace -is [Security.AccessControl.CommonAce]) {
            if ($ace.AceQualifier -ne 'AccessAllowed') { continue }   # deny ACEs only take access away
            [pscustomobject]@{
                Sid     = $ace.SecurityIdentifier.Value
                Mask    = $ace.AccessMask -band (-bnot $script:SynchronizeBit)
                Rights  = ([Security.AccessControl.FileSystemRights]$ace.AccessMask).ToString()
                Inherit = $ace.InheritanceFlags.ToString()
                Prop    = $ace.PropagationFlags.ToString()
            }
        } elseif ("$($ace.AceType)" -notmatch 'Denied') {
            [pscustomobject]@{ Sid = "<$($ace.AceType) ACE>"; Mask = -1; Rights = "$($ace.AceType)"; Inherit = ''; Prop = '' }
        }
    })
    [pscustomobject]@{
        OwnerSid  = if ($sd.Owner) { $sd.Owner.Value } else { $null }
        Protected = [bool]($sd.ControlFlags -band [Security.AccessControl.ControlFlags]::DiscretionaryAclProtected)
        IsLink    = [bool]($info.Attributes -band [uint32][IO.FileAttributes]::ReparsePoint)
        IsDir     = [bool]($info.Attributes -band [uint32][IO.FileAttributes]::Directory)
        Allow     = $allow
    }
}

# Owner only, read without following a link. Throws unless it is Administrators or SYSTEM.
function Assert-AdminOwned([string]$Path) {
    $a = Get-AclSnapshot $Path
    if ($a.IsLink) { throw "$Path is a link (reparse point)" }
    if ($a.OwnerSid -notin $script:OwnerSid, $script:SystemSid) { throw "$Path is owned by $($a.OwnerSid), not Administrators/SYSTEM" }
}

# Exact allowlist: owner Administrators/SYSTEM, inheritance cut, and every allow ACE is one of the intended grants
# with exactly its rights (Synchronize aside): nothing extra such as AppendData, WRITE_DAC, WRITE_OWNER or DELETE.
# Each intended grant must be present (on a directory as one (OI)(CI) ACE that applies to the folder itself).
function Assert-AclAllowlist([string]$Path, $Grants, [switch]$File) {
    $a = Get-AclSnapshot $Path
    $problems = @()
    if ($a.IsLink) { $problems += 'it is a link (reparse point)' }
    if ($a.OwnerSid -notin $script:OwnerSid, $script:SystemSid) { $problems += "owner is $($a.OwnerSid), not Administrators/SYSTEM" }
    if (-not $a.Protected) { $problems += 'inheritance from the parent is not disabled' }
    $want = @{}
    foreach ($g in $Grants) { $want[$g.Sid] = [int]$g.Rights -band (-bnot $script:SynchronizeBit) }
    foreach ($ace in $a.Allow) {
        if (-not $want.ContainsKey($ace.Sid)) { $problems += "unexpected access for $($ace.Sid) ($($ace.Rights))"; continue }
        if ($ace.Mask -ne $want[$ace.Sid]) { $problems += "$($ace.Sid) has $($ace.Rights), not exactly the intended grant" }
    }
    foreach ($sid in $want.Keys) {
        $ok = $a.Allow | Where-Object {
            $_.Sid -eq $sid -and $_.Mask -eq $want[$sid] -and $_.Prop -eq 'None' -and ($File -or $_.Inherit -eq 'ContainerInherit, ObjectInherit')
        }
        if (-not $ok) { $problems += "$sid lacks its grant" }
    }
    if ($problems) { throw "ACL on $Path is wrong: $($problems -join '; ')" }
}

# Private folder: Administrators/SYSTEM only.
function Assert-PrivateAcl([string]$Folder) { Assert-AclAllowlist $Folder (Get-PrivateGrants) }
# The root: Administrators F, SYSTEM F, LocalService read+execute.
function Assert-RootAcl([string]$Root) { Assert-AclAllowlist $Root (Get-RootGrants) }
# Secret file: private, or private plus LocalService read.
function Assert-SecretAcl([string]$File, [switch]$LocalServiceRead) { Assert-AclAllowlist $File (Get-SecretGrants -LocalServiceRead:$LocalServiceRead) -File }
