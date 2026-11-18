package power

import (
	"fmt"

	"golang.org/x/sys/windows"
)

var (
	powrprof            = windows.NewLazySystemDLL("powrprof.dll")
	procSetSuspendState = powrprof.NewProc("SetSuspendState")
	advapi              = windows.NewLazySystemDLL("advapi32.dll")
	procShutdownEx      = advapi.NewProc("InitiateSystemShutdownExW")
)

// SHTDN_REASON_MAJOR_OTHER | SHTDN_REASON_MINOR_OTHER | SHTDN_REASON_FLAG_PLANNED
const shutdownReason = 0x00000000 | 0x00000000 | 0x80000000

// Exec sleeps, shuts down or restarts this PC now. Apps are closed without asking: the countdown was the warning.
func Exec(action string) error {
	if err := enableShutdownPrivilege(); err != nil {
		return err
	}
	switch action {
	case "sleep":
		// SetSuspendState(hibernate=FALSE, force=FALSE, wakeupEventsDisabled=FALSE): wake-on-LAN keeps working.
		if r, _, err := procSetSuspendState.Call(0, 0, 0); r == 0 {
			return err
		}
		return nil
	case "shutdown", "restart":
		reboot := uintptr(0)
		if action == "restart" {
			reboot = 1
		}
		// InitiateSystemShutdownExW(machine=nil, message=nil, timeout=0, forceAppsClosed=TRUE, reboot, reason)
		if r, _, err := procShutdownEx.Call(0, 0, 0, 1, reboot, shutdownReason); r == 0 {
			return err
		}
		return nil
	default:
		return fmt.Errorf("unknown action %q", action)
	}
}

func enableShutdownPrivilege() error {
	var token windows.Token
	if err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_ADJUST_PRIVILEGES|windows.TOKEN_QUERY, &token); err != nil {
		return err
	}
	defer token.Close()
	var luid windows.LUID
	if err := windows.LookupPrivilegeValue(nil, windows.StringToUTF16Ptr("SeShutdownPrivilege"), &luid); err != nil {
		return err
	}
	tp := windows.Tokenprivileges{PrivilegeCount: 1}
	tp.Privileges[0] = windows.LUIDAndAttributes{Luid: luid, Attributes: windows.SE_PRIVILEGE_ENABLED}
	return windows.AdjustTokenPrivileges(token, false, &tp, 0, nil, nil)
}
