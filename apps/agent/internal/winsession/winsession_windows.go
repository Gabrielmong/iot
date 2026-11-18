// Package winsession describes the session someone is using (at the console, or else over Remote Desktop):
// who is signed in, idle time, whether it's locked.
package winsession

import (
	"encoding/binary"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	wtsapi        = windows.NewLazySystemDLL("wtsapi32.dll")
	procQueryInfo = wtsapi.NewProc("WTSQuerySessionInformationW")
)

const (
	wtsUserName      = 5
	wtsSessionInfo   = 24
	wtsSessionInfoEx = 25
	stateLock        = 0 // WTS_SESSIONSTATE_LOCK
)

// Console is the session someone is using. ID is NoSession when nobody is (e.g. at boot).
type Console struct {
	ID     uint32
	User   string // "" when nobody is signed in
	IdleS  *int64 // nil when Windows doesn't report it
	Locked bool
}

// wtsInfo mirrors WTSINFOW (Win32 layout; the int64 fields are 8-aligned like LARGE_INTEGER).
type wtsInfo struct {
	State, SessionID                           uint32
	InBytes, OutBytes, InFrames, OutFrames     uint32
	InCompressedBytes, OutCompressedBytes      uint32
	WinStationName                             [32]uint16
	Domain                                     [17]uint16
	UserName                                   [21]uint16
	ConnectTime, DisconnectTime, LastInputTime int64
	LogonTime, CurrentTime                     int64
}

// Active reads the session someone is using (see pick).
func Active() Console {
	c := Console{ID: UserSession()}
	if c.ID == noSession {
		return c
	}
	c.User = userOf(c.ID)
	if buf, ok := query(c.ID, wtsSessionInfo); ok {
		info := (*wtsInfo)(unsafe.Pointer(buf))
		if info.LastInputTime != 0 && info.CurrentTime > info.LastInputTime {
			s := (info.CurrentTime - info.LastInputTime) / 10_000_000
			c.IdleS = &s
		}
		free(buf)
	}
	// WTSINFOEXW: DWORD Level, then (8-aligned) WTSINFOEX_LEVEL1_W { SessionId, SessionState, SessionFlags, ... }.
	if buf, ok := query(c.ID, wtsSessionInfoEx); ok {
		raw := unsafe.Slice(buf, 20)
		c.Locked = int32(binary.LittleEndian.Uint32(raw[16:20])) == stateLock
		free(buf)
	}
	return c
}

// UserSession is the id of the session someone is using (see pick), or NoSession.
func UserSession() uint32 {
	console := windows.WTSGetActiveConsoleSessionId()
	var list *windows.WTS_SESSION_INFO
	var n uint32
	if windows.WTSEnumerateSessions(0, 0, 1, &list, &n) != nil {
		if userOf(console) == "" {
			return noSession
		}
		return console
	}
	defer windows.WTSFreeMemory(uintptr(unsafe.Pointer(list)))
	var sessions []candidate
	for _, s := range unsafe.Slice(list, n) {
		sessions = append(sessions, candidate{ID: s.SessionID, Active: s.State == windows.WTSActive, User: userOf(s.SessionID)})
	}
	return pick(console, sessions)
}

func userOf(session uint32) string {
	if session == noSession {
		return ""
	}
	buf, ok := query(session, wtsUserName)
	if !ok {
		return ""
	}
	defer free(buf)
	return windows.UTF16PtrToString((*uint16)(unsafe.Pointer(buf)))
}

func query(session uint32, class uintptr) (*byte, bool) {
	var buf *byte
	var n uint32
	r, _, _ := procQueryInfo.Call(0, uintptr(session), class, uintptr(unsafe.Pointer(&buf)), uintptr(unsafe.Pointer(&n)))
	return buf, r != 0 && buf != nil
}

func free(buf *byte) { windows.WTSFreeMemory(uintptr(unsafe.Pointer(buf))) }
