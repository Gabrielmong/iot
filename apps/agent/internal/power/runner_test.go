package power

import (
	"errors"
	"sync"
	"testing"
	"time"

	"homeagent/internal/protocol"
)

type fakePrompt struct {
	exit   chan int
	killed chan struct{}
	once   sync.Once
}

func newFakePrompt() *fakePrompt {
	return &fakePrompt{exit: make(chan int, 1), killed: make(chan struct{})}
}
func (p *fakePrompt) Wait() int {
	select {
	case c := <-p.exit:
		return c
	case <-p.killed:
		return 1
	}
}
func (p *fakePrompt) Kill() { p.once.Do(func() { close(p.killed) }) }

type harness struct {
	r       *Runner
	prompt  *fakePrompt
	reports chan protocol.PowerState
	mu      sync.Mutex
	execs   []string
	launch  []string
}

func newHarness(s Session, launchErr error) *harness {
	h := &harness{prompt: newFakePrompt(), reports: make(chan protocol.PowerState, 32)}
	h.r = &Runner{
		Exec: func(action string) error {
			h.mu.Lock()
			h.execs = append(h.execs, action)
			h.mu.Unlock()
			return nil
		},
		Launch: func(action, by string, seconds int) (Process, error) {
			h.mu.Lock()
			h.launch = append(h.launch, action+"|"+by)
			h.mu.Unlock()
			if launchErr != nil {
				return nil, launchErr
			}
			return h.prompt, nil
		},
		Session:     func() Session { return s },
		ReportEvery: time.Hour,
		Grace:       50 * time.Millisecond,
	}
	return h
}

func (h *harness) handle(id, action string, seconds int) {
	h.r.Handle(protocol.Power{ID: id, Action: action, RequestedBy: "Ann", Seconds: seconds}, func(s protocol.PowerState) { h.reports <- s })
}

func (h *harness) next(t *testing.T) protocol.PowerState {
	t.Helper()
	select {
	case s := <-h.reports:
		return s
	case <-time.After(2 * time.Second):
		t.Fatal("no report")
		return protocol.PowerState{}
	}
}

func (h *harness) executed() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]string{}, h.execs...)
}

func TestCancelledAtThePromptNeverExecutes(t *testing.T) {
	h := newHarness(Session{SignedIn: true}, nil)
	h.handle("p1", "restart", 60)
	if s := h.next(t); s.Phase != "countdown" || s.ID != "p1" || s.SecondsLeft == nil || *s.SecondsLeft != 60 {
		t.Fatalf("got %+v", s)
	}
	h.prompt.exit <- 1
	if s := h.next(t); s.Phase != "cancelled" {
		t.Fatalf("got %+v", s)
	}
	time.Sleep(20 * time.Millisecond)
	if len(h.executed()) != 0 {
		t.Fatalf("executed %v", h.executed())
	}
	if h.launch[0] != "restart|Ann" {
		t.Fatalf("launch %v", h.launch)
	}
}

func TestDoItNowExecutesOnce(t *testing.T) {
	h := newHarness(Session{SignedIn: true}, nil)
	h.handle("p1", "sleep", 60)
	h.next(t)
	h.prompt.exit <- 0
	if s := h.next(t); s.Phase != "executing" {
		t.Fatalf("got %+v", s)
	}
	waitFor(t, func() bool { return len(h.executed()) == 1 })
	if h.executed()[0] != "sleep" {
		t.Fatalf("executed %v", h.executed())
	}
}

func TestCancelFromTheAppKillsThePrompt(t *testing.T) {
	h := newHarness(Session{SignedIn: true}, nil)
	h.handle("p1", "shutdown", 60)
	h.next(t)
	h.r.Cancel("other") // not ours: ignored
	h.r.Cancel("p1")
	if s := h.next(t); s.Phase != "cancelled" {
		t.Fatalf("got %+v", s)
	}
	select {
	case <-h.prompt.killed:
	default:
		t.Fatal("prompt not killed")
	}
	if len(h.executed()) != 0 {
		t.Fatal("executed")
	}
}

func TestASecondRequestWhileOneRunsIsSkipped(t *testing.T) {
	h := newHarness(Session{SignedIn: true}, nil)
	h.handle("p1", "restart", 60)
	h.next(t)
	h.handle("p2", "sleep", 60)
	if s := h.next(t); s.Phase != "skipped" || s.ID != "p2" {
		t.Fatalf("got %+v", s)
	}
	h.prompt.exit <- 1
	h.next(t)
}

func TestNobodySignedInActsImmediately(t *testing.T) {
	h := newHarness(Session{}, nil)
	h.handle("p1", "shutdown", 60)
	if s := h.next(t); s.Phase != "executing" {
		t.Fatalf("got %+v", s)
	}
	waitFor(t, func() bool { return len(h.executed()) == 1 })
	if len(h.launch) != 0 {
		t.Fatal("prompted")
	}
}

func TestAPromptThatOverstaysIsKilledAndTheActionRuns(t *testing.T) {
	h := newHarness(Session{SignedIn: true}, nil)
	h.handle("p1", "sleep", 0) // deadline = 0 s + grace
	h.next(t)
	if s := h.next(t); s.Phase != "executing" {
		t.Fatalf("got %+v", s)
	}
	waitFor(t, func() bool { return len(h.executed()) == 1 })
}

func TestNoPromptStillCountsDownAndCanBeCancelled(t *testing.T) {
	h := newHarness(Session{SignedIn: true}, errors.New("no desktop"))
	h.handle("p1", "restart", 60)
	if s := h.next(t); s.Phase != "countdown" {
		t.Fatalf("got %+v", s)
	}
	h.r.Cancel("p1")
	if s := h.next(t); s.Phase != "cancelled" {
		t.Fatalf("got %+v", s)
	}
}

func TestCountdownIsReportedPeriodically(t *testing.T) {
	h := newHarness(Session{SignedIn: true}, nil)
	h.r.ReportEvery = 10 * time.Millisecond
	h.handle("p1", "restart", 60)
	h.next(t)
	if s := h.next(t); s.Phase != "countdown" || s.SecondsLeft == nil {
		t.Fatalf("got %+v", s)
	}
	h.prompt.exit <- 1
}

func waitFor(t *testing.T, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for !ok() {
		if time.Now().After(deadline) {
			t.Fatal("timed out")
		}
		time.Sleep(5 * time.Millisecond)
	}
}
