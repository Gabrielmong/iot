package service

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"sync"
	"testing"
	"time"

	"homeagent/internal/protocol"
)

type record struct {
	mu     sync.Mutex
	events []string
}

func (r *record) add(e string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, e)
}

func (r *record) list() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.events...)
}

type fakeSampler struct {
	r        *record
	interval time.Duration
}

func (s *fakeSampler) Start(d time.Duration) { s.interval = d; s.r.add("sample.start") }
func (s *fakeSampler) Stop()                 { s.r.add("sample.stop") }

type fakePower struct{ r *record }

func (p fakePower) Handle(protocol.Power, func(protocol.PowerState)) { p.r.add("power") }
func (p fakePower) Cancel(id string)                                 { p.r.add("cancel " + id) }

type quietLog struct{ r *record }

func (l quietLog) Info(string)      {}
func (l quietLog) Error(msg string) { l.r.add("error " + msg) }

func newAgent(r *record) (*Agent, *fakeSampler) {
	s := &fakeSampler{r: r}
	a := &Agent{
		Send: func(m protocol.Outgoing) bool {
			r.add("send " + string(protocol.Encode(m)))
			return true
		},
		Sampler:   s,
		Power:     fakePower{r},
		Update:    func(context.Context, protocol.Update) error { return errors.New("bad hash") },
		Uninstall: func() error { r.add("uninstall"); return nil },
		Stop:      func() { r.add("stop") },
		Log:       quietLog{r},
	}
	return a, s
}

func TestUninstallAcksThenRemovesThenStops(t *testing.T) {
	r := &record{}
	a, _ := newAgent(r)
	a.OnUninstall()
	want := []string{"sample.stop", `send {"v":1,"t":"uninstall.ack"}`, "uninstall", "stop"}
	if got := r.list(); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestStatsIntervalIsAtLeastASecond(t *testing.T) {
	r := &record{}
	a, s := newAgent(r)
	a.OnStatsStart(5)
	if s.interval != time.Second {
		t.Fatalf("interval %v", s.interval)
	}
	a.OnStatsStart(2500)
	if s.interval != 2500*time.Millisecond {
		t.Fatalf("interval %v", s.interval)
	}
}

func TestDisconnectStopsSampling(t *testing.T) {
	r := &record{}
	a, _ := newAgent(r)
	a.OnDisconnected()
	if got := r.list(); !reflect.DeepEqual(got, []string{"sample.stop"}) {
		t.Fatalf("got %v", got)
	}
}

func TestAFailedUpdateIsLoggedAndKeepsRunning(t *testing.T) {
	r := &record{}
	a, _ := newAgent(r)
	a.OnUpdate(protocol.Update{Version: 9})
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		for _, e := range r.list() {
			if e == "error update to version 9 failed: bad hash" {
				return
			}
			if e == "stop" {
				t.Fatal("a failed update stopped the agent")
			}
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("no error logged: %v", r.list())
}

type fakeEvents struct{ r *record }

func (e fakeEvents) Connected(c bool)    { e.r.add(fmt.Sprintf("connected %v", c)) }
func (e fakeEvents) UpdateOffered(v int) { e.r.add(fmt.Sprintf("offered %d", v)) }
func (e fakeEvents) UpdateNone(v int)    { e.r.add(fmt.Sprintf("none %d", v)) }

func TestAgentReportsEvents(t *testing.T) {
	r := &record{}
	a, _ := newAgent(r)
	a.Events = fakeEvents{r}
	a.OnConnected()
	a.OnUpdateNone(protocol.UpdateNone{Version: 14})
	a.OnUpdate(protocol.Update{Version: 15})
	a.OnDisconnected()
	got := map[string]bool{}
	for _, e := range r.list() {
		got[e] = true
	}
	for _, want := range []string{"connected true", "none 14", "offered 15", "connected false"} {
		if !got[want] {
			t.Errorf("missing %q in %v", want, r.list())
		}
	}
}

func TestAgentWithoutEventsIsFine(t *testing.T) {
	a, _ := newAgent(&record{})
	a.OnConnected()
	a.OnUpdateNone(protocol.UpdateNone{Version: 1})
}
