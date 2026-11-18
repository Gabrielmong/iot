package winsession

import "testing"

func TestPickPrefersTheConsoleWhenSomeoneIsSignedInThere(t *testing.T) {
	got := pick(1, []candidate{{ID: 1, Active: true, User: "ann"}, {ID: 2, Active: true, User: "bob"}})
	if got != 1 {
		t.Fatalf("got %d", got)
	}
}

func TestPickFindsARemoteDesktopUserWhenTheConsoleIsEmpty(t *testing.T) {
	// Over RDP the console shows the sign-in screen (no user); the user works in session 2.
	got := pick(1, []candidate{{ID: 0}, {ID: 1, Active: false}, {ID: 2, Active: true, User: "ann"}})
	if got != 2 {
		t.Fatalf("got %d", got)
	}
}

func TestPickIgnoresDisconnectedSessions(t *testing.T) {
	// Nobody can see a prompt in a disconnected session, like a locked one.
	if got := pick(1, []candidate{{ID: 1}, {ID: 3, Active: false, User: "bob"}}); got != NoSession {
		t.Fatalf("got %d", got)
	}
	if got := pick(NoSession, nil); got != NoSession {
		t.Fatalf("got %d", got)
	}
}
