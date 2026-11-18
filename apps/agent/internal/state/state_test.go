package state

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"
)

func TestSaveThenLoad(t *testing.T) {
	p := filepath.Join(t.TempDir(), "HomeAgent", "agent.json")
	want := State{Server: "http://192.168.0.100:4000", DeviceID: "dev-1", Token: "tok_secret"}
	if err := Save(p, want); err != nil {
		t.Fatal(err)
	}
	got, err := Load(p)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("got %+v", got)
	}
}

func TestSaveReplacesTheOldState(t *testing.T) {
	p := filepath.Join(t.TempDir(), "agent.json")
	_ = Save(p, State{Server: "http://a", DeviceID: "1", Token: "old"})
	if err := Save(p, State{Server: "http://a", DeviceID: "1", Token: "new"}); err != nil {
		t.Fatal(err)
	}
	if got, _ := Load(p); got.Token != "new" {
		t.Fatalf("got %+v", got)
	}
}

func TestLoadMissingIsNotExist(t *testing.T) {
	_, err := Load(filepath.Join(t.TempDir(), "agent.json"))
	if !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("got %v", err)
	}
}

func TestSaveNeverWritesThroughAPlantedTempFile(t *testing.T) {
	dir := t.TempDir()
	victim := filepath.Join(dir, "victim.txt")
	if err := os.WriteFile(victim, []byte("untouched"), 0o600); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(dir, "agent.json")
	if err := os.Link(victim, p+".tmp"); err != nil {
		t.Skip("hard links unsupported here:", err)
	}
	if err := Save(p, State{Server: "http://a", DeviceID: "1", Token: "secret"}); err != nil {
		t.Fatal(err)
	}
	if raw, _ := os.ReadFile(victim); string(raw) != "untouched" {
		t.Fatalf("victim now %q", raw)
	}
}

func TestForInstallKeepsTheCurrentPairingAsAFallback(t *testing.T) {
	old := State{Server: "http://srv", DeviceID: "dev-1", Token: "tok"}
	got := ForInstall(old, "http://srv", "code-2")
	if got != (State{Server: "http://srv", DeviceID: "dev-1", Token: "tok", Code: "code-2"}) {
		t.Fatalf("got %+v", got)
	}
	if got := ForInstall(old, "http://other", "code-2"); got != (State{Server: "http://other", Code: "code-2"}) {
		t.Fatalf("a different server can't use the old token: %+v", got)
	}
	if got := ForInstall(State{}, "http://srv", "c"); got != (State{Server: "http://srv", Code: "c"}) {
		t.Fatalf("fresh install: %+v", got)
	}
}
