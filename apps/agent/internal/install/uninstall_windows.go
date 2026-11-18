package install

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc/mgr"

	"homeagent/internal/eventlog"
	"homeagent/internal/paths"
)

// FromService removes the agent while the service itself is running (the server said the PC was removed):
// the service is marked for deletion (Windows deletes it once it stops), the state goes now, and the
// install folder is deleted a few seconds after this process exits. The caller then stops the service.
func FromService() error {
	if err := deleteService(false); err != nil {
		return err
	}
	return removeFiles()
}

// Manual removes the agent from an admin's command line (`HomeAgent.exe uninstall`): stops the service first.
func Manual() error {
	if err := deleteService(true); err != nil {
		return err
	}
	return removeFiles()
}

func deleteService(stopFirst bool) error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(paths.ServiceName)
	if err != nil {
		return nil // already gone
	}
	defer s.Close()
	if stopFirst {
		if err := stopAndWait(s); err != nil {
			return err
		}
	}
	return s.Delete()
}

func removeFiles() error {
	if err := os.RemoveAll(paths.StateDir()); err != nil {
		return err
	}
	_ = eventlog.Unregister()
	return deleteLater(paths.InstallDir())
}

// deleteLater removes dir ~3 s from now, after this process (which runs from it) has exited.
func deleteLater(dir string) error {
	cmd := exec.Command(paths.System32("cmd.exe"))
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CmdLine:       fmt.Sprintf(`/c "%s" -n 4 127.0.0.1 >nul & rmdir /s /q "%s"`, paths.System32("PING.EXE"), dir),
		HideWindow:    true,
		CreationFlags: windows.CREATE_NO_WINDOW | windows.CREATE_NEW_PROCESS_GROUP,
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}
