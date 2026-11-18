package install

import (
	"os"

	"golang.org/x/sys/windows"
)

// Elevated reports whether this process runs as an elevated administrator (or SYSTEM).
func Elevated() bool { return windows.GetCurrentProcessToken().IsElevated() }

// Relaunch starts this exe again elevated with args (UAC prompt); the caller then exits.
func Relaunch(args string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	return windows.ShellExecute(0, windows.StringToUTF16Ptr("runas"), windows.StringToUTF16Ptr(exe), windows.StringToUTF16Ptr(args), nil, windows.SW_NORMAL)
}

// Tell shows a message box to the person who ran the installer.
func Tell(text string, isError bool) {
	flags := uint32(windows.MB_OK | windows.MB_ICONINFORMATION | windows.MB_SETFOREGROUND)
	if isError {
		flags = windows.MB_OK | windows.MB_ICONERROR | windows.MB_SETFOREGROUND
	}
	_, _ = windows.MessageBox(0, windows.StringToUTF16Ptr(text), windows.StringToUTF16Ptr("HomeAgent"), flags)
}
