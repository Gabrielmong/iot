package trayhub

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"homeagent/internal/traypipe"
)

type fakeServerPC struct {
	reads    atomic.Int32
	mu       sync.Mutex
	commands []string
	err      error
}

func (f *fakeServerPC) Read(context.Context) traypipe.ServerState {
	f.reads.Add(1)
	return traypipe.ServerState{State: "running", Sha: "94c48fc1"}
}

func (f *fakeServerPC) Command(_ context.Context, typ, by string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.commands = append(f.commands, typ+" by "+by)
	return f.err
}

func newHub(sendOK bool) (*Hub, *atomic.Int32) {
	var sent atomic.Int32
	h := &Hub{
		Version: 14, Server: "http://192.168.0.100:4000", DeviceID: "dev1",
		SendCheck:    func(int) bool { sent.Add(1); return sendOK },
		Hide:         func(uint32) {},
		CheckTimeout: time.Second,
	}
	return h, &sent
}

func next(t *testing.T, ch <-chan traypipe.Status) traypipe.Status {
	t.Helper()
	select {
	case s := <-ch:
		return s
	case <-time.After(2 * time.Second):
		t.Fatal("no status")
		return traypipe.Status{}
	}
}

func TestSubscribeGivesCurrentThenChanges(t *testing.T) {
	h, _ := newHub(true)
	ch, stop := h.Subscribe()
	defer stop()
	if s := next(t, ch); s != (traypipe.Status{Version: 14, Server: "http://192.168.0.100:4000", DeviceID: "dev1"}) {
		t.Fatalf("first %+v", s)
	}
	h.Connected(true)
	if s := next(t, ch); !s.Connected {
		t.Fatalf("after connect %+v", s)
	}
}

func check(h *Hub) traypipe.Reply {
	return h.Handle(context.Background(), 1, "me", traypipe.Request{T: traypipe.UpdateCheck, ID: "c1"})
}

func TestUpdateCheckWhileDisconnected(t *testing.T) {
	h, _ := newHub(false)
	if r := check(h); r.OK || r.Message != "Not connected to Home" || r.ID != "c1" || r.T != traypipe.Result {
		t.Fatalf("got %+v", r)
	}
}

func answerLater(f func()) { go func() { time.Sleep(30 * time.Millisecond); f() }() }

func TestUpdateCheckAnswers(t *testing.T) {
	h, _ := newHub(true)
	answerLater(func() { h.UpdateOffered(15) })
	if r := check(h); !r.OK || r.Message != "Updating to version 15…" {
		t.Fatalf("offered: %+v", r)
	}
	answerLater(func() { h.UpdateNone(14) })
	if r := check(h); !r.OK || r.Message != "Up to date (version 14)" {
		t.Fatalf("none: %+v", r)
	}
}

func TestUpdateCheckTimesOut(t *testing.T) {
	h, _ := newHub(true)
	h.CheckTimeout = 50 * time.Millisecond
	if r := check(h); r.OK || r.Message != "Home didn't answer" {
		t.Fatalf("got %+v", r)
	}
}

func TestUpdateCheckEndsWhenTheConnectionDrops(t *testing.T) {
	h, _ := newHub(true)
	answerLater(func() { h.Connected(false) })
	if r := check(h); r.OK || r.Message != "Not connected to Home" {
		t.Fatalf("got %+v", r)
	}
}

func TestConcurrentChecksShareOneRequest(t *testing.T) {
	h, sent := newHub(true)
	var wg sync.WaitGroup
	replies := make([]traypipe.Reply, 2)
	for i := range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); replies[i] = check(h) }()
	}
	time.Sleep(50 * time.Millisecond)
	h.UpdateNone(14)
	wg.Wait()
	if sent.Load() != 1 || replies[0].Message != "Up to date (version 14)" || replies[1].Message != replies[0].Message {
		t.Fatalf("sent %d replies %+v", sent.Load(), replies)
	}
}

func TestServerCommandsOffTheServerPC(t *testing.T) {
	h, _ := newHub(true)
	r := h.Handle(context.Background(), 1, "me", traypipe.Request{T: traypipe.ServerDeploy, ID: "d"})
	if r.OK || r.Message != "This PC isn't the server" {
		t.Fatalf("got %+v", r)
	}
}

func TestServerCommands(t *testing.T) {
	h, _ := newHub(true)
	f := &fakeServerPC{}
	h.ServerPC = f
	r := h.Handle(context.Background(), 1, "Gabriel on EPKG4 (tray)", traypipe.Request{T: traypipe.ServerDeploy, ID: "d"})
	if !r.OK || r.Message != "Deploy started" || r.ID != "d" {
		t.Fatalf("deploy %+v", r)
	}
	r = h.Handle(context.Background(), 1, "Gabriel on EPKG4 (tray)", traypipe.Request{T: traypipe.ServerRestart, ID: "r"})
	if !r.OK || r.Message != "Restarting the server" {
		t.Fatalf("restart %+v", r)
	}
	if len(f.commands) != 2 || f.commands[0] != "deployNow by Gabriel on EPKG4 (tray)" || f.commands[1] != "restartApp by Gabriel on EPKG4 (tray)" {
		t.Fatalf("commands %v", f.commands)
	}
	f.err = errors.New("Busy: Deploying abc1234")
	r = h.Handle(context.Background(), 1, "x", traypipe.Request{T: traypipe.ServerDeploy, ID: "d2"})
	if r.OK || r.Message != "Busy: Deploying abc1234" {
		t.Fatalf("refused %+v", r)
	}
}

func TestHideHidesThatSession(t *testing.T) {
	h, _ := newHub(true)
	var hidden uint32
	h.Hide = func(s uint32) { hidden = s }
	r := h.Handle(context.Background(), 7, "me", traypipe.Request{T: traypipe.TrayHide})
	if !r.OK || hidden != 7 {
		t.Fatalf("got %+v hidden %d", r, hidden)
	}
}

func TestStatusGet(t *testing.T) {
	h, _ := newHub(true)
	r := h.Handle(context.Background(), 1, "me", traypipe.Request{T: traypipe.StatusGet})
	if r.T != traypipe.StatusReply || r.Status == nil || r.Status.Version != 14 {
		t.Fatalf("got %+v", r)
	}
}

func TestRunPollsOnlyWithSubscribers(t *testing.T) {
	h, _ := newHub(true)
	f := &fakeServerPC{}
	h.ServerPC = f
	h.PollEvery = 20 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go h.Run(ctx)
	time.Sleep(100 * time.Millisecond)
	if f.reads.Load() != 0 {
		t.Fatalf("read %d times with nobody watching", f.reads.Load())
	}
	ch, stop := h.Subscribe()
	defer stop()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case s := <-ch:
			if s.ServerPC != nil && s.ServerPC.State == "running" && s.ServerPC.Sha == "94c48fc1" {
				return
			}
		case <-deadline:
			t.Fatalf("no server state; reads %d", f.reads.Load())
		}
	}
}
