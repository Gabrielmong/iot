package client

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"

	"homeagent/internal/protocol"
)

type recorder struct {
	mu     sync.Mutex
	events []string
	power  []protocol.Power
}

func (r *recorder) add(e string)               { r.mu.Lock(); r.events = append(r.events, e); r.mu.Unlock() }
func (r *recorder) OnStatsStart(ms int)        { r.add("stats.start") }
func (r *recorder) OnStatsStop()               { r.add("stats.stop") }
func (r *recorder) OnPowerCancel(id string)    { r.add("power.cancel " + id) }
func (r *recorder) OnUninstall()               { r.add("uninstall") }
func (r *recorder) OnUpdate(u protocol.Update) { r.add("update") }
func (r *recorder) OnDisconnected()            { r.add("disconnected") }
func (r *recorder) OnConnected()               { r.add("connected") }
func (r *recorder) OnUpdateNone(u protocol.UpdateNone) {
	r.add(fmt.Sprintf("update.none %d", u.Version))
}
func (r *recorder) OnPower(p protocol.Power) {
	r.mu.Lock()
	r.power = append(r.power, p)
	r.mu.Unlock()
}
func (r *recorder) snapshot() ([]string, []protocol.Power) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string{}, r.events...), append([]protocol.Power{}, r.power...)
}

type logs struct {
	mu    sync.Mutex
	lines []string
}

func (l *logs) Info(m string)  { l.mu.Lock(); l.lines = append(l.lines, m); l.mu.Unlock() }
func (l *logs) Error(m string) { l.Info(m) }
func (l *logs) joined() string { l.mu.Lock(); defer l.mu.Unlock(); return strings.Join(l.lines, "\n") }

func hello() protocol.Hello { return info }

func TestRunSendsHelloThenHeartbeatsAndDispatches(t *testing.T) {
	got := make(chan string, 8)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agent/ws" || r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		ctx := r.Context()
		for range 2 {
			_, data, err := c.Read(ctx)
			if err != nil {
				return
			}
			got <- string(data)
		}
		_ = c.Write(ctx, websocket.MessageText, []byte(`{"v":1,"t":"power","id":"p1","action":"sleep","requestedBy":"Ann","seconds":60}`))
		_ = c.Write(ctx, websocket.MessageText, []byte(`{"v":1,"t":"exec","cmd":"calc"}`))
		_, _, _ = c.Read(ctx)
	}))
	defer srv.Close()

	rec := &recorder{}
	lg := &logs{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c := New(Config{Server: srv.URL, Token: "tok", Log: lg, HeartbeatEvery: 30 * time.Millisecond}, rec, hello)
	go func() { _ = c.Run(ctx) }()

	first := <-got
	if !strings.HasPrefix(first, `{"v":1,"t":"hello"`) || !strings.Contains(first, `"hostname":"GANDALF"`) {
		t.Fatalf("first %s", first)
	}
	if second := <-got; second != `{"v":1,"t":"heartbeat"}` {
		t.Fatalf("second %s", second)
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		if _, p := rec.snapshot(); len(p) == 1 {
			if p[0].ID != "p1" || p[0].Action != "sleep" || p[0].RequestedBy != "Ann" {
				t.Fatalf("power %+v", p[0])
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("no power dispatched")
		}
		time.Sleep(5 * time.Millisecond)
	}
	for !strings.Contains(lg.joined(), "exec") {
		if time.Now().After(deadline) {
			t.Fatalf("unknown type not logged: %s", lg.joined())
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestRejectedTokenWaitsAnHourAndNeverUninstalls(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusUnauthorized) }))
	defer srv.Close()
	rec := &recorder{}
	lg := &logs{}
	ctx, cancel := context.WithCancel(context.Background())
	var slept []time.Duration
	sleep := func(ctx context.Context, d time.Duration) error {
		slept = append(slept, d)
		cancel()
		return ctx.Err()
	}
	c := New(Config{Server: srv.URL, Token: "old", Log: lg, Sleep: sleep}, rec, hello)
	_ = c.Run(ctx)
	if len(slept) != 1 || slept[0] != time.Hour {
		t.Fatalf("slept %v", slept)
	}
	if !strings.Contains(lg.joined(), "server rejected the agent token") {
		t.Fatalf("logs %s", lg.joined())
	}
	if ev, _ := rec.snapshot(); len(ev) != 0 {
		t.Fatalf("events %v", ev)
	}
}

func TestUnreachableServerBacksOff(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close() // nothing listens any more
	ctx, cancel := context.WithCancel(context.Background())
	var slept []time.Duration
	sleep := func(ctx context.Context, d time.Duration) error {
		slept = append(slept, d)
		if len(slept) == 3 {
			cancel()
		}
		return ctx.Err()
	}
	_ = New(Config{Server: url, Token: "t", Log: &logs{}, Sleep: sleep}, &recorder{}, hello).Run(ctx)
	if len(slept) != 3 || slept[0] != time.Second || slept[1] != 2*time.Second || slept[2] != 4*time.Second {
		t.Fatalf("slept %v", slept)
	}
}

func TestSendWithoutAConnectionReportsFalse(t *testing.T) {
	c := New(Config{Server: "http://127.0.0.1:1", Token: "t", Log: &logs{}}, &recorder{}, hello)
	if c.Send(protocol.Heartbeat{}) {
		t.Fatal("sent without a connection")
	}
}

func TestReportsConnectedThenUpdateNoneThenDisconnected(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		ctx := r.Context()
		_, _, _ = c.Read(ctx) // hello
		_ = c.Write(ctx, websocket.MessageText, []byte(`{"v":1,"t":"update.none","version":15}`))
		time.Sleep(50 * time.Millisecond)
		_ = c.Close(websocket.StatusNormalClosure, "bye")
	}))
	defer srv.Close()
	rec := &recorder{}
	ctx, cancel := context.WithCancel(context.Background())
	sleep := func(ctx context.Context, d time.Duration) error { cancel(); return ctx.Err() }
	c := New(Config{Server: srv.URL, Token: "tok", Log: &logs{}, HeartbeatEvery: time.Hour, Sleep: sleep}, rec, hello)
	_ = c.Run(ctx)
	ev, _ := rec.snapshot()
	want := []string{"connected", "update.none 15", "disconnected"}
	if strings.Join(ev, ",") != strings.Join(want, ",") {
		t.Fatalf("events %v", ev)
	}
}
