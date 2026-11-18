// Package trayhub is the service side of the tray: it keeps the status the trays show and answers their requests.
package trayhub

import (
	"context"
	"sync"
	"time"

	"homeagent/internal/traypipe"
)

// ServerPC is the Home server on this PC (nil elsewhere).
type ServerPC interface {
	Read(ctx context.Context) traypipe.ServerState
	Command(ctx context.Context, typ, by string) error
}

// Hub is shared by every tray connection. Set the exported fields before use.
type Hub struct {
	Version          int
	Server, DeviceID string
	SendCheck        func(version int) bool // sends update.check to the server; false when not connected
	ServerPC         ServerPC
	Hide             func(session uint32)
	CheckTimeout     time.Duration // 0: 15 s
	PollEvery        time.Duration // 0: 5 s

	mu        sync.Mutex
	connected bool
	server    *traypipe.ServerState
	subs      map[int]chan traypipe.Status
	nextSub   int
	wake      chan struct{}
	wakeOnce  sync.Once
	checks    checks
}

var _ interface {
	Connected(bool)
	UpdateOffered(int)
	UpdateNone(int)
} = (*Hub)(nil)

func (h *Hub) wakeCh() chan struct{} {
	h.wakeOnce.Do(func() { h.wake = make(chan struct{}, 1) })
	return h.wake
}

func (h *Hub) poke() {
	select {
	case h.wakeCh() <- struct{}{}:
	default:
	}
}

func (h *Hub) statusLocked() traypipe.Status {
	s := traypipe.Status{Version: h.Version, Connected: h.connected, Server: h.Server, DeviceID: h.DeviceID}
	if h.server != nil {
		copy := *h.server
		s.ServerPC = &copy
	}
	return s
}

// publish pushes the current status to every subscriber; a slow one only ever gets the latest.
func (h *Hub) publishLocked() {
	s := h.statusLocked()
	for _, ch := range h.subs {
		select {
		case <-ch:
		default:
		}
		ch <- s
	}
}

// Subscribe yields the current status, then every change; call the func to stop.
func (h *Hub) Subscribe() (<-chan traypipe.Status, func()) {
	ch := make(chan traypipe.Status, 1)
	h.mu.Lock()
	if h.subs == nil {
		h.subs = map[int]chan traypipe.Status{}
	}
	id := h.nextSub
	h.nextSub++
	h.subs[id] = ch
	ch <- h.statusLocked()
	h.mu.Unlock()
	h.poke()
	return ch, func() {
		h.mu.Lock()
		delete(h.subs, id)
		h.mu.Unlock()
	}
}

func (h *Hub) Connected(c bool) {
	h.mu.Lock()
	h.connected = c
	h.publishLocked()
	h.mu.Unlock()
	if !c {
		h.checks.answer(checkAnswer{msg: msgNotConnected})
	}
}

func (h *Hub) UpdateOffered(version int) { h.checks.answer(offered(version)) }
func (h *Hub) UpdateNone(version int)    { h.checks.answer(upToDate(version)) }

// Handle answers one tray request from session (by names the person, for the deployer's history).
func (h *Hub) Handle(ctx context.Context, session uint32, by string, r traypipe.Request) traypipe.Reply {
	switch r.T {
	case traypipe.StatusGet:
		h.mu.Lock()
		s := h.statusLocked()
		h.mu.Unlock()
		return traypipe.Reply{T: traypipe.StatusReply, Status: &s}
	case traypipe.UpdateCheck:
		a := h.checks.ask(ctx, func() bool { return h.SendCheck(h.Version) }, orDefault(h.CheckTimeout, 15*time.Second))
		return result(r.ID, a.ok, a.msg)
	case traypipe.ServerRestart:
		return h.command(ctx, r.ID, "restartApp", by, "Restarting the server")
	case traypipe.ServerDeploy:
		return h.command(ctx, r.ID, "deployNow", by, "Deploy started")
	case traypipe.TrayHide:
		h.Hide(session)
		return result(r.ID, true, "")
	default:
		return result(r.ID, false, "Unknown request")
	}
}

func (h *Hub) command(ctx context.Context, id, typ, by, done string) traypipe.Reply {
	if h.ServerPC == nil {
		return result(id, false, "This PC isn't the server")
	}
	if err := h.ServerPC.Command(ctx, typ, by); err != nil {
		return result(id, false, err.Error())
	}
	h.poke() // show "Deploying…" straight away
	return result(id, true, done)
}

// Run polls the server PC while at least one tray is connected, until ctx ends.
func (h *Hub) Run(ctx context.Context) {
	if h.ServerPC == nil {
		return
	}
	ticker := time.NewTicker(orDefault(h.PollEvery, 5*time.Second))
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-h.wakeCh():
		}
		h.mu.Lock()
		watched := len(h.subs) > 0
		h.mu.Unlock()
		if !watched {
			continue
		}
		s := h.ServerPC.Read(ctx)
		h.mu.Lock()
		if h.server == nil || *h.server != s {
			h.server = &s
			h.publishLocked()
		}
		h.mu.Unlock()
	}
}

func result(id string, ok bool, msg string) traypipe.Reply {
	return traypipe.Reply{T: traypipe.Result, ID: id, OK: ok, Message: msg}
}

func orDefault(d, def time.Duration) time.Duration {
	if d <= 0 {
		return def
	}
	return d
}
