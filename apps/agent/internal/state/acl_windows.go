package state

import (
	"errors"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

// protectedSDDL: owned by Administrators; SYSTEM and Administrators only, inherited by everything inside,
// nothing inherited from above.
const protectedSDDL = "O:BAD:P(A;OICI;GA;;;SY)(A;OICI;GA;;;BA)"

// ErrNotOurs: the state folder already exists but is a link or was created by someone other than SYSTEM or
// Administrators (ProgramData lets any user create folders). It is never reused; an admin must remove it.
var ErrNotOurs = errors.New(`the HomeAgent state folder was not created by Windows administrators; delete it and install again`)

// ProtectDir makes dir with the protected descriptor applied at creation (atomically), or re-applies it to a
// folder SYSTEM or Administrators already own, through one handle that never follows reparse points.
// Needs an elevated caller (the installer runs elevated).
func ProtectDir(dir string) error {
	sd, err := windows.SecurityDescriptorFromString(protectedSDDL)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dir), 0o755); err != nil {
		return err
	}
	p, err := windows.UTF16PtrFromString(dir)
	if err != nil {
		return err
	}
	sa := windows.SecurityAttributes{Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), SecurityDescriptor: sd}
	err = windows.CreateDirectory(p, &sa)
	if err == nil || !errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		return err
	}
	return reprotect(p, sd)
}

func reprotect(p *uint16, sd *windows.SECURITY_DESCRIPTOR) error {
	h, err := windows.CreateFile(p, windows.READ_CONTROL|windows.WRITE_DAC|windows.WRITE_OWNER,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE, nil, windows.OPEN_EXISTING,
		windows.FILE_FLAG_BACKUP_SEMANTICS|windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		return err
	}
	defer windows.CloseHandle(h)
	var info windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(h, &info); err != nil {
		return err
	}
	if info.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 || info.FileAttributes&windows.FILE_ATTRIBUTE_DIRECTORY == 0 {
		return ErrNotOurs
	}
	current, err := windows.GetSecurityInfo(h, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION)
	if err != nil {
		return err
	}
	owner, _, err := current.Owner()
	if err != nil {
		return err
	}
	if !owner.IsWellKnown(windows.WinLocalSystemSid) && !owner.IsWellKnown(windows.WinBuiltinAdministratorsSid) {
		return ErrNotOurs
	}
	newOwner, _, err := sd.Owner()
	if err != nil {
		return err
	}
	dacl, _, err := sd.DACL()
	if err != nil {
		return err
	}
	return windows.SetSecurityInfo(h, windows.SE_FILE_OBJECT,
		windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION,
		newOwner, nil, dacl, nil)
}
