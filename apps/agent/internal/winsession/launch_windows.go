package winsession

import (
	"os"
	"unsafe"

	"golang.org/x/sys/windows"
)

// LaunchAs runs this executable with args on session's desktop, as the user signed into it, and returns the
// process handle (the caller closes it). Only LocalSystem can do this: WTSQueryUserToken needs SE_TCB_NAME.
func LaunchAs(session uint32, args []string) (windows.Handle, error) {
	var token windows.Token
	if err := windows.WTSQueryUserToken(session, &token); err != nil {
		return 0, err
	}
	defer token.Close()
	exe, err := os.Executable()
	if err != nil {
		return 0, err
	}
	cmdline := windows.ComposeCommandLine(append([]string{exe}, args...))
	var env *uint16
	var block *uint16
	if windows.CreateEnvironmentBlock(&block, token, false) == nil {
		env = block
		defer windows.DestroyEnvironmentBlock(block)
	}
	si := windows.StartupInfo{Desktop: windows.StringToUTF16Ptr(`winsta0\default`)}
	si.Cb = uint32(unsafe.Sizeof(si))
	var pi windows.ProcessInformation
	err = windows.CreateProcessAsUser(token, windows.StringToUTF16Ptr(exe), windows.StringToUTF16Ptr(cmdline),
		nil, nil, false, windows.CREATE_UNICODE_ENVIRONMENT, env, nil, &si, &pi)
	if err != nil {
		return 0, err
	}
	windows.CloseHandle(pi.Thread)
	return pi.Process, nil
}

// UserSessions is every active session someone is signed into (console and Remote Desktop).
func UserSessions() []uint32 {
	var list *windows.WTS_SESSION_INFO
	var n uint32
	if windows.WTSEnumerateSessions(0, 0, 1, &list, &n) != nil {
		return nil
	}
	defer windows.WTSFreeMemory(uintptr(unsafe.Pointer(list)))
	var out []uint32
	for _, s := range unsafe.Slice(list, n) {
		if s.State == windows.WTSActive && userOf(s.SessionID) != "" {
			out = append(out, s.SessionID)
		}
	}
	return out
}

// UserOf is the name of the user signed into session ("" for none).
func UserOf(session uint32) string { return userOf(session) }

// LogonTime is when session's sign-in began (a FILETIME), or 0 when Windows doesn't say.
func LogonTime(session uint32) int64 {
	buf, ok := query(session, wtsSessionInfo)
	if !ok {
		return 0
	}
	defer free(buf)
	return (*wtsInfo)(unsafe.Pointer(buf)).LogonTime
}
