package trays

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// A hide outlives the service (an agent update restarts it) while the same sign-in lasts.
func TestHideSurvivesAServiceRestart(t *testing.T) {
	logons := map[uint32]int64{1: 50, 2: 100}
	var saved map[uint32]int64
	before, _ := newPolicy()
	before.Logon = func(s uint32) int64 { return logons[s] }
	before.Save = func(h map[uint32]int64) { saved = h }
	before.Hidden(2)

	after, _ := newPolicy()
	after.Logon = before.Logon
	after.Restore(saved)
	if got := after.ToLaunch([]uint32{1, 2}, nil); !reflect.DeepEqual(got, []uint32{1}) {
		t.Fatalf("after the restart: %v", got)
	}
}

// Session ids are reused: a later sign-in that got the same id isn't hidden.
func TestAHideEndsWithItsSignIn(t *testing.T) {
	p, _ := newPolicy()
	p.Logon = func(uint32) int64 { return 200 }
	p.Restore(map[uint32]int64{2: 100})
	if got := p.ToLaunch([]uint32{2}, nil); !reflect.DeepEqual(got, []uint32{2}) {
		t.Fatalf("a new sign-in stayed hidden: %v", got)
	}
}

func TestSavesAndLoadsHiddenSessions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "hidden-trays.json")
	if got := LoadHidden(path); len(got) != 0 {
		t.Fatalf("missing file: %v", got)
	}
	want := map[uint32]int64{2: 133_000_000_000_000_000}
	if err := SaveHidden(path, want); err != nil {
		t.Fatal(err)
	}
	if got := LoadHidden(path); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v", got)
	}
	_ = os.WriteFile(path, []byte("not json"), 0o600)
	if got := LoadHidden(path); len(got) != 0 {
		t.Fatalf("garbage: %v", got)
	}
}
