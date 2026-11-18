package state

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"golang.org/x/sys/windows"
)

func requireElevated(t *testing.T) {
	t.Helper()
	if !windows.GetCurrentProcessToken().IsElevated() {
		t.Skip("needs an elevated (administrator) shell")
	}
}

func ownerOf(t *testing.T, dir string) (*windows.SID, windows.SECURITY_DESCRIPTOR_CONTROL) {
	t.Helper()
	sd, err := windows.GetNamedSecurityInfo(dir, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		t.Fatal(err)
	}
	owner, _, _ := sd.Owner()
	ctl, _, _ := sd.Control()
	return owner, ctl
}

func TestProtectDirCreatesALockedFolder(t *testing.T) {
	requireElevated(t)
	dir := filepath.Join(t.TempDir(), "HomeAgent")
	if err := ProtectDir(dir); err != nil {
		t.Fatal(err)
	}
	owner, ctl := ownerOf(t, dir)
	if !owner.IsWellKnown(windows.WinBuiltinAdministratorsSid) || ctl&windows.SE_DACL_PROTECTED == 0 {
		t.Fatalf("owner %s control %x", owner, ctl)
	}
	if err := ProtectDir(dir); err != nil { // a reinstall re-applies
		t.Fatalf("again: %v", err)
	}
}

func TestProtectDirRefusesAPlantedJunction(t *testing.T) {
	requireElevated(t)
	base := t.TempDir()
	target := filepath.Join(base, "elsewhere")
	_ = os.Mkdir(target, 0o700)
	dir := filepath.Join(base, "HomeAgent")
	if out, err := exec.Command("cmd", "/c", "mklink", "/J", dir, target).CombinedOutput(); err != nil {
		t.Skipf("mklink: %v %s", err, out)
	}
	if err := ProtectDir(dir); !errors.Is(err, ErrNotOurs) {
		t.Fatalf("got %v", err)
	}
}

func TestProtectDirRefusesAFolderSomeoneElseOwns(t *testing.T) {
	requireElevated(t)
	dir := filepath.Join(t.TempDir(), "HomeAgent")
	_ = os.Mkdir(dir, 0o700)
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		t.Fatal(err)
	}
	if err := windows.SetNamedSecurityInfo(dir, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION, user.User.Sid, nil, nil, nil); err != nil {
		t.Skip("can't set the owner:", err)
	}
	if err := ProtectDir(dir); !errors.Is(err, ErrNotOurs) {
		t.Fatalf("got %v", err)
	}
}
