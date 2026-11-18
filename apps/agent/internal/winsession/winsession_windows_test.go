package winsession

import (
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

func TestReadsTheConsoleSession(t *testing.T) {
	c := Active()
	if c.ID == NoSession {
		t.Skip("no console session")
	}
	idle := int64(-1)
	if c.IdleS != nil {
		idle = *c.IdleS
	}
	t.Logf("session %d user %q locked %v idle %d", c.ID, c.User, c.Locked, idle)
	if c.User == "" {
		t.Fatal("a console session with nobody signed in while tests run")
	}
	if c.Locked {
		t.Fatal("reported locked while someone is running tests at it")
	}
}

func TestReadsThisSessionsLogonTime(t *testing.T) {
	var s uint32
	if err := windows.ProcessIdToSessionId(windows.GetCurrentProcessId(), &s); err != nil || s == 0 {
		t.Skip("not in a user session")
	}
	logon := LogonTime(s)
	now := time.Now().UnixNano()/100 + 116444736000000000 // FILETIME
	if logon <= 0 || logon >= now {
		t.Fatalf("logon time %d, now %d", logon, now)
	}
	if LogonTime(s) != logon {
		t.Fatal("logon time changed between reads")
	}
}
