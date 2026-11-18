package stats

import (
	"golang.org/x/sys/windows"

	"homeagent/internal/protocol"
)

// fixedDisks lists local fixed drives (no USB sticks, optical or network drives) with their free and total bytes.
func fixedDisks() []protocol.Disk {
	mask, err := windows.GetLogicalDrives()
	if err != nil {
		return nil
	}
	var out []protocol.Disk
	for i := range 26 {
		if mask&(1<<i) == 0 {
			continue
		}
		root := string(rune('A'+i)) + ":\\"
		p, _ := windows.UTF16PtrFromString(root)
		if windows.GetDriveType(p) != windows.DRIVE_FIXED {
			continue
		}
		var free, total, totalFree uint64
		if windows.GetDiskFreeSpaceEx(p, &free, &total, &totalFree) != nil {
			continue
		}
		out = append(out, protocol.Disk{Mount: root[:2], Free: float64(free), Total: float64(total)})
	}
	return out
}
