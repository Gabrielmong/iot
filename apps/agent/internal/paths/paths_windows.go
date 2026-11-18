// Package paths names where the agent lives on a PC, from Windows' known folders (never from environment variables).
package paths

import (
	"path/filepath"

	"golang.org/x/sys/windows"
)

// ServiceName is the Windows service (and event log source) name.
const ServiceName = "HomeAgent"

func known(id *windows.KNOWNFOLDERID, fallback string) string {
	p, err := windows.KnownFolderPath(id, 0)
	if err != nil {
		return fallback
	}
	return p
}

// InstallDir is C:\Program Files\HomeAgent.
func InstallDir() string {
	return filepath.Join(known(windows.FOLDERID_ProgramFiles, `C:\Program Files`), ServiceName)
}

// InstalledExe is the service's exe.
func InstalledExe() string { return filepath.Join(InstallDir(), "HomeAgent.exe") }

// StateDir is C:\ProgramData\HomeAgent (SYSTEM and Administrators only).
func StateDir() string {
	return filepath.Join(known(windows.FOLDERID_ProgramData, `C:\ProgramData`), ServiceName)
}

// StateFile holds the server, device id and token (or, before enrollment, the one-time code).
func StateFile() string { return filepath.Join(StateDir(), "agent.json") }

// System32 runs helper programs (cmd, ping) by full path, never through PATH.
func System32(exe string) string {
	dir, err := windows.GetSystemDirectory()
	if err != nil {
		dir = `C:\Windows\System32`
	}
	return filepath.Join(dir, exe)
}
