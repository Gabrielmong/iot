package main

import (
	"reflect"
	"testing"
)

func TestParseModes(t *testing.T) {
	cases := []struct {
		args []string
		want invocation
	}{
		{nil, invocation{mode: modeInstall}},
		{[]string{"service"}, invocation{mode: modeService}},
		{[]string{"uninstall"}, invocation{mode: modeUninstall}},
		{[]string{"prompt", "--action", "restart", "--by", "Ann Lee", "--seconds", "60"}, invocation{mode: modePrompt, action: "restart", by: "Ann Lee", seconds: 60}},
		{[]string{"update-helper", "--from", `C:\a.exe`, "--to", `C:\b.exe`}, invocation{mode: modeUpdateHelper, from: `C:\a.exe`, to: `C:\b.exe`}},
		{[]string{"rdp", "home-rdp://192.168.0.100/"}, invocation{mode: modeRdp, link: "home-rdp://192.168.0.100/"}},
	}
	for _, c := range cases {
		got, err := parseArgs(c.args)
		if err != nil {
			t.Fatalf("%v: %v", c.args, err)
		}
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("%v: got %+v", c.args, got)
		}
	}
}

func TestRejectsUnknownModesAndBadFlags(t *testing.T) {
	for _, args := range [][]string{
		{"exec"},
		{"prompt", "--action", "format", "--by", "x", "--seconds", "60"},
		{"prompt", "--action", "sleep", "--by", "x", "--seconds", "-1"},
		{"update-helper", "--from", `C:\a.exe`},
		{"service", "--extra"},
		{"rdp"},
		{"rdp", "home-rdp://192.168.0.100", "extra"},
	} {
		if _, err := parseArgs(args); err == nil {
			t.Errorf("%v accepted", args)
		}
	}
}

func TestVersionDefaultsToZero(t *testing.T) {
	if agentVersion("") != 0 || agentVersion("1004") != 1004 || agentVersion("x") != 0 {
		t.Fatal("bad version parsing")
	}
}
