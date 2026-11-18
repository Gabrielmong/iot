package trays

import (
	"fmt"
	"sync"
	"time"

	"golang.org/x/sys/windows"
)

// stopKilled is the exit code of a tray StopAll had to kill.
const stopKilled = 1

// Logger is where the manager reports launch failures.
type Logger interface {
	Info(msg string)
	Error(msg string)
}

// Manager keeps one tray (HomeAgent.exe tray) running in every signed-in session the Policy allows.
type Manager struct {
	Policy   *Policy
	Launch   func(session uint32) (windows.Handle, error)
	Sessions func() []uint32
	Log      Logger

	mu      sync.Mutex
	running map[uint32]windows.Handle
	stopped bool
}

// Sync starts the trays that are missing.
func (m *Manager) Sync() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.stopped {
		return
	}
	if m.running == nil {
		m.running = map[uint32]windows.Handle{}
	}
	live := map[uint32]bool{}
	for s := range m.running {
		live[s] = true
	}
	for _, s := range m.Policy.ToLaunch(m.Sessions(), live) {
		h, err := m.Launch(s)
		m.Policy.Launched(s) // a failed launch counts too, so a broken session isn't retried forever
		if err != nil {
			m.Log.Error(fmt.Sprintf("can't start the tray in session %d: %v", s, err))
			continue
		}
		m.running[s] = h
		go m.watch(s, h)
	}
}

// watch waits for a tray to exit, forgets it and starts what's missing (the policy decides whether that
// includes this session again).
func (m *Manager) watch(s uint32, h windows.Handle) {
	_, _ = windows.WaitForSingleObject(h, windows.INFINITE)
	m.mu.Lock()
	if m.running[s] == h {
		delete(m.running, s)
	}
	m.mu.Unlock()
	windows.CloseHandle(h)
	m.Sync()
}

// Hide: the tray in session asked to stay away until the next sign-in (it exits by itself).
func (m *Manager) Hide(s uint32) { m.Policy.Hidden(s) }

// LoggedOff forgets session's hide and backoff.
func (m *Manager) LoggedOff(s uint32) { m.Policy.LoggedOff(s) }

// StopAll ends every tray (the service is stopping, maybe for an update that must replace the exe). The
// trays see their pipe close and leave by themselves, removing their icons; only those still running after
// grace are killed (a killed tray leaves a ghost icon until the mouse passes over it). Holding mu keeps watch
// from closing the handles meanwhile.
func (m *Manager) StopAll(grace time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopped = true
	deadline := time.Now().Add(grace)
	for _, h := range m.running {
		left := max(time.Until(deadline), 0)
		if ev, _ := windows.WaitForSingleObject(h, uint32(left.Milliseconds())); ev != windows.WAIT_OBJECT_0 {
			_ = windows.TerminateProcess(h, stopKilled)
		}
	}
}
