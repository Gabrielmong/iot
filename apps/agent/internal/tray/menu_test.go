package tray

import (
	"reflect"
	"testing"

	"homeagent/internal/traypipe"
)

const server = "http://192.168.0.100:4000"

func agentPC(connected bool) traypipe.Status {
	return traypipe.Status{Version: 14, Connected: connected, Server: server, DeviceID: "dev1"}
}

func serverPC(state, label string) traypipe.Status {
	s := agentPC(true)
	s.ServerPC = &traypipe.ServerState{State: state, Label: label, Sha: "94c48fc1a2b3"}
	return s
}

var sep = Item{Separator: true}

func TestAgentMenu(t *testing.T) {
	want := []Item{
		{ID: IDStatus, Label: "HomeAgent 14 · Connected", Disabled: true},
		sep,
		{ID: IDOpenHome, Label: "Open Home"},
		{ID: IDOpenPC, Label: "Open this PC in Home"},
		sep,
		{ID: IDCheck, Label: "Check for updates"},
		sep,
		{ID: IDHide, Label: "Hide until next sign-in"},
	}
	if got := Menu(agentPC(true)); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v", got)
	}
}

func TestDisconnectedMenuKeepsCheckEnabled(t *testing.T) {
	got := Menu(agentPC(false))
	if got[0].Label != "HomeAgent 14 · Not connected — retrying" {
		t.Fatalf("status %q", got[0].Label)
	}
	for _, it := range got {
		if it.ID == IDCheck && it.Disabled {
			t.Fatal("check disabled")
		}
	}
}

func TestServerMenu(t *testing.T) {
	want := []Item{
		{ID: IDServerStatus, Label: "Server · Running 94c48fc", Disabled: true},
		{ID: IDOpenHome, Label: "Open Home"},
		{ID: IDOpenDeploys, Label: "Open Deploys page"},
		{ID: IDRestart, Label: "Restart server…"},
		{ID: IDDeploy, Label: "Deploy latest now…"},
		sep,
		{ID: IDStatus, Label: "HomeAgent 14 · Connected", Disabled: true},
		{ID: IDOpenPC, Label: "Open this PC in Home"},
		{ID: IDCheck, Label: "Check for updates"},
		sep,
		{ID: IDHide, Label: "Hide until next sign-in"},
	}
	if got := Menu(serverPC("running", "")); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v", got)
	}
}

func TestServerStatesAndBusy(t *testing.T) {
	cases := map[string]string{
		"busy":           "Server · Deploying abc1234",
		"not-responding": "Server · Not responding",
		"stopped":        "Server · Stopped",
		"deployer-down":  "Server · Deployer not responding",
	}
	for state, label := range cases {
		got := Menu(serverPC(state, "Deploying abc1234"))
		if got[0].Label != label {
			t.Errorf("%s: %q", state, got[0].Label)
		}
	}
	for _, it := range Menu(serverPC("busy", "Deploying abc1234")) {
		if (it.ID == IDRestart || it.ID == IDDeploy) && !it.Disabled {
			t.Errorf("%s enabled while busy", it.Label)
		}
	}
}

func TestTargets(t *testing.T) {
	s := agentPC(true)
	s.Server = server + "/"
	cases := map[ItemID]string{
		IDOpenHome:    server + "/",
		IDOpenPC:      server + "/devices/dev1",
		IDOpenDeploys: server + "/admin/deploys",
		IDCheck:       "",
	}
	for id, want := range cases {
		if got := Target(s, id); got != want {
			t.Errorf("%d: %q", id, got)
		}
	}
}

func TestTooltipAndDimmed(t *testing.T) {
	if got := Tooltip(agentPC(true)); got != "Home — connected" {
		t.Errorf("agent %q", got)
	}
	if got := Tooltip(agentPC(false)); got != "Home — not connected" {
		t.Errorf("offline %q", got)
	}
	if got := Tooltip(serverPC("running", "")); got != "Home — connected · server running" {
		t.Errorf("server %q", got)
	}
	if got := Tooltip(serverPC("stopped", "")); got != "Home — connected · server stopped" {
		t.Errorf("stopped %q", got)
	}
	if Dimmed(agentPC(true)) || !Dimmed(agentPC(false)) || Dimmed(serverPC("running", "")) || !Dimmed(serverPC("stopped", "")) {
		t.Error("dimmed wrong")
	}
}

func TestTargetsOnlyOpenWebPages(t *testing.T) {
	for _, bad := range []string{"file:///C:/Windows/System32/calc.exe", `C:\Windows\calc.exe`, "javascript:alert(1)", ""} {
		s := agentPC(true)
		s.Server = bad
		if got := Target(s, IDOpenHome); got != "" {
			t.Errorf("%q gave %q", bad, got)
		}
	}
}
