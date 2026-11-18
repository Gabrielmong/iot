package stats

import (
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"

	"homeagent/internal/winsession"
)

// activeSession returns the user signed in at the console and, when Windows reports it, how long they've been idle.
func activeSession() (*string, *int64) {
	c := winsession.Active()
	if c.User == "" {
		return nil, c.IdleS
	}
	return &c.User, c.IdleS
}

// hideWindow keeps helper processes (nvidia-smi) from flashing a console.
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
}
