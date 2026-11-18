package winsession

import "testing"

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
