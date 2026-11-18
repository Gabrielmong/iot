package stats

import (
	"os"

	"golang.org/x/sys/windows"
)

// trustedNvidiaSmi finds nvidia-smi in System32 or the driver's NVSMI folder under Program Files.
func trustedNvidiaSmi() string {
	sys, err := windows.GetSystemDirectory()
	if err != nil {
		return ""
	}
	pf, err := windows.KnownFolderPath(windows.FOLDERID_ProgramFiles, 0)
	if err != nil {
		return ""
	}
	return nvidiaSmiPath(sys, pf, func(p string) bool {
		fi, err := os.Stat(p)
		return err == nil && fi.Mode().IsRegular()
	})
}
