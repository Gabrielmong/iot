package tray

import "testing"

type note struct {
	title, text string
	ok          bool
}

func step(w *Watch, state string) note {
	t, x, ok := w.Next(serverPC(state, "Deploying abc1234"))
	return note{t, x, ok}
}

func TestDeployFinished(t *testing.T) {
	var w Watch
	w.Started("deploy")
	if n := step(&w, "busy"); n.ok {
		t.Fatalf("busy gave %+v", n)
	}
	if n := step(&w, "running"); n != (note{"Deploy finished", "Running 94c48fc", true}) {
		t.Fatalf("got %+v", n)
	}
	if n := step(&w, "running"); n.ok {
		t.Fatal("told twice")
	}
}

func TestDeployEndedBadly(t *testing.T) {
	var w Watch
	w.Started("deploy")
	step(&w, "busy")
	if n := step(&w, "stopped"); n != (note{"Deploy ended", "The server is stopped — see the Deploys page", true}) {
		t.Fatalf("got %+v", n)
	}
}

func TestRestartFinished(t *testing.T) {
	var w Watch
	w.Started("restart")
	step(&w, "busy")
	if n := step(&w, "running"); n != (note{"Server restarted", "Running 94c48fc", true}) {
		t.Fatalf("got %+v", n)
	}
}

func TestNothingWithoutAStart(t *testing.T) {
	var w Watch
	step(&w, "busy")
	if n := step(&w, "running"); n.ok {
		t.Fatalf("got %+v", n)
	}
}

func TestWaitsForBusyBeforeReporting(t *testing.T) {
	var w Watch
	w.Started("deploy")
	if n := step(&w, "running"); n.ok { // the status from before the command
		t.Fatalf("got %+v", n)
	}
}
