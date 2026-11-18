package protocol

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

func TestDecodesEveryServerMessage(t *testing.T) {
	cases := map[string]Message{
		`{"v":1,"t":"stats.start","intervalMs":2000}`: StatsStart{IntervalMs: 2000},
		`{"v":1,"t":"stats.stop"}`:                    StatsStop{},
		`{"v":1,"t":"power","id":"p1","action":"sleep","requestedBy":"Routine Night","seconds":60}`: Power{ID: "p1", Action: "sleep", RequestedBy: "Routine Night", Seconds: 60},
		`{"v":1,"t":"power.cancel","id":"p1"}`:                                                      PowerCancel{ID: "p1"},
		`{"v":1,"t":"uninstall"}`:                                                                   Uninstall{},
		`{"v":1,"t":"update","version":1004,"url":"/agent/HomeAgent.exe","sha256":"ab12"}`:          Update{Version: 1004, URL: "/agent/HomeAgent.exe", Sha256: "ab12"},
	}
	for raw, want := range cases {
		got, err := Decode([]byte(raw))
		if err != nil {
			t.Fatalf("%s: %v", raw, err)
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%s: got %#v", raw, got)
		}
	}
}

func TestRejectsOtherVersions(t *testing.T) {
	if _, err := Decode([]byte(`{"v":2,"t":"stats.stop"}`)); err == nil {
		t.Fatal("v2 accepted")
	}
	if _, err := Decode([]byte(`{"t":"stats.stop"}`)); err == nil {
		t.Fatal("missing v accepted")
	}
}

func TestUnknownTypeIsErrUnknown(t *testing.T) {
	_, err := Decode([]byte(`{"v":1,"t":"exec","cmd":"calc"}`))
	if !errors.Is(err, ErrUnknown) {
		t.Fatalf("got %v", err)
	}
}

func TestRejectsBadPowerActions(t *testing.T) {
	if _, err := Decode([]byte(`{"v":1,"t":"power","id":"p1","action":"format","requestedBy":"x","seconds":60}`)); err == nil {
		t.Fatal("unknown action accepted")
	}
}

func TestEncodeAddsVersionAndType(t *testing.T) {
	var m map[string]any
	if err := json.Unmarshal(Encode(PowerState{ID: "p1", Phase: "countdown", SecondsLeft: ptr(42)}), &m); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"v": 1.0, "t": "power.state", "id": "p1", "phase": "countdown", "secondsLeft": 42.0}
	if !reflect.DeepEqual(m, want) {
		t.Fatalf("got %v", m)
	}
	if string(Encode(Heartbeat{})) != `{"v":1,"t":"heartbeat"}` {
		t.Fatalf("got %s", Encode(Heartbeat{}))
	}
}

func TestEncodeLeavesOutAbsentOptionalStats(t *testing.T) {
	var m map[string]any
	_ = json.Unmarshal(Encode(Stats{Disks: []Disk{}}), &m)
	for _, k := range []string{"gpu", "user", "idleS"} {
		if _, ok := m[k]; ok {
			t.Errorf("%s present", k)
		}
	}
	if _, ok := m["disks"]; !ok {
		t.Error("disks missing")
	}
}

func ptr[T any](v T) *T { return &v }

func TestRejectsCountdownsOutsideTenSecondsToAnHour(t *testing.T) {
	for _, secs := range []string{"0", "-5", "9", "3601"} {
		raw := `{"v":1,"t":"power","id":"p1","action":"restart","requestedBy":"x","seconds":` + secs + `}`
		if _, err := Decode([]byte(raw)); err == nil {
			t.Errorf("seconds %s accepted", secs)
		}
	}
}
