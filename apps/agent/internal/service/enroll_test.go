package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"homeagent/internal/client"
	"homeagent/internal/state"
)

type enrollLog struct{ errors []string }

func (l *enrollLog) Info(string)                   {}
func (l *enrollLog) Error(msg string)              { l.errors = append(l.errors, msg) }
func noSleep(context.Context, time.Duration) error { return nil }

func TestEnrollKeepsTheExistingPairingWhenARerunDownloadWasUsed(t *testing.T) {
	var saved []state.State
	save := func(s state.State) error { saved = append(saved, s); return nil }
	gone := func(context.Context, string) (string, string, error) { return "", "", client.ErrCodeGone }
	st := state.State{Server: "http://srv", DeviceID: "dev-1", Token: "tok", Code: "used"}
	log := &enrollLog{}
	got, err := enroll(context.Background(), st, gone, save, noSleep, log)
	want := state.State{Server: "http://srv", DeviceID: "dev-1", Token: "tok"}
	if err != nil || got != want {
		t.Fatalf("got %+v, %v", got, err)
	}
	if len(saved) != 1 || saved[0] != want {
		t.Fatalf("saved %+v", saved)
	}
	if len(log.errors) != 1 {
		t.Fatalf("logs %v", log.errors)
	}
}

func TestEnrollWithAFreshCodeReplacesTheOldPairing(t *testing.T) {
	ok := func(_ context.Context, code string) (string, string, error) { return "dev-2", "tok-2", nil }
	st := state.State{Server: "http://srv", DeviceID: "dev-1", Token: "tok", Code: "fresh"}
	got, err := enroll(context.Background(), st, ok, func(state.State) error { return nil }, noSleep, &enrollLog{})
	if err != nil || got != (state.State{Server: "http://srv", DeviceID: "dev-2", Token: "tok-2"}) {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestEnrollWithAUsedCodeAndNoPairingStops(t *testing.T) {
	gone := func(context.Context, string) (string, string, error) { return "", "", client.ErrCodeGone }
	_, err := enroll(context.Background(), state.State{Server: "http://srv", Code: "used"}, gone, func(state.State) error { return nil }, noSleep, &enrollLog{})
	if !errors.Is(err, errGone) {
		t.Fatalf("got %v", err)
	}
}

func TestEnrollWithoutACodeUsesTheSavedToken(t *testing.T) {
	never := func(context.Context, string) (string, string, error) { t.Fatal("redeemed"); return "", "", nil }
	st := state.State{Server: "http://srv", DeviceID: "dev-1", Token: "tok"}
	if got, err := enroll(context.Background(), st, never, nil, noSleep, &enrollLog{}); err != nil || got != st {
		t.Fatalf("got %+v, %v", got, err)
	}
}
