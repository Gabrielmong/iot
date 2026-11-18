package service

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"

	"homeagent/internal/eventlog"
	"homeagent/internal/paths"
	"homeagent/internal/protocol"
	"homeagent/internal/serverpc"
	"homeagent/internal/state"
	"homeagent/internal/trayhub"
	"homeagent/internal/traypipe"
	"homeagent/internal/trays"
	"homeagent/internal/winsession"
)

const wtsSessionLogoff = 6 // WTS_SESSION_LOGOFF

// sessionEvent is a session change the Service Control Manager told us about.
type sessionEvent struct {
	kind    uint32
	session uint32
}

var procMoveMemory = windows.NewLazySystemDLL("kernel32.dll").NewProc("RtlMoveMemory")

func sessionEventFrom(c svc.ChangeRequest) sessionEvent {
	e := sessionEvent{kind: c.EventType}
	if c.EventData != 0 {
		// WTSSESSION_NOTIFICATION { DWORD cbSize; DWORD dwSessionId; }, copied out of the SCM's memory
		var n [2]uint32
		_, _, _ = procMoveMemory.Call(uintptr(unsafe.Pointer(&n)), c.EventData, unsafe.Sizeof(n))
		e.session = n[1]
	}
	return e
}

// trayService is the service's side of the tray icons: the hub, the pipe and the tray processes.
type trayService struct {
	hub     *trayhub.Hub
	manager *trays.Manager
}

func startTrays(ctx context.Context, st state.State, version int, send func(protocol.Outgoing) bool, log *eventlog.Log) *trayService {
	manager := &trays.Manager{
		Policy:   hiddenPolicy(log),
		Launch:   func(s uint32) (windows.Handle, error) { return winsession.LaunchAs(s, []string{"tray"}) },
		Sessions: winsession.UserSessions,
		Log:      log,
	}
	hub := &trayhub.Hub{
		Version:   version,
		Server:    st.Server,
		DeviceID:  st.DeviceID,
		SendCheck: func(v int) bool { return send(protocol.UpdateCheck{Version: v}) },
		Hide:      manager.Hide,
	}
	if cfg, ok := serverpc.Detect(); ok {
		hub.ServerPC = &serverpc.Source{Config: cfg, Server: st.Server}
		log.Info("this PC runs the Home server; the tray shows its section")
	}
	go hub.Run(ctx)
	go func() {
		if err := traypipe.Serve(ctx, hub, byName, log); err != nil {
			log.Error("tray pipe stopped: " + err.Error())
		}
	}()
	manager.Sync()
	return &trayService{hub: hub, manager: manager}
}

// hiddenTrays keeps "Hide until next sign-in" across service restarts (an agent update restarts it).
func hiddenTrays() string { return filepath.Join(paths.StateDir(), "hidden-trays.json") }

func hiddenPolicy(log *eventlog.Log) *trays.Policy {
	p := &trays.Policy{
		Now:   time.Now,
		Logon: winsession.LogonTime,
		Save: func(hidden map[uint32]int64) {
			if err := trays.SaveHidden(hiddenTrays(), hidden); err != nil {
				log.Error("can't save the hidden tray icons: " + err.Error())
			}
		},
	}
	p.Restore(trays.LoadHidden(hiddenTrays()))
	return p
}

// follow starts trays as people sign in, unlock or connect over Remote Desktop.
func (t *trayService) follow(ctx context.Context, sessions <-chan sessionEvent) {
	for {
		select {
		case <-ctx.Done():
			return
		case e := <-sessions:
			if e.kind == wtsSessionLogoff {
				t.manager.LoggedOff(e.session)
			}
			t.manager.Sync()
		}
	}
}

// trayGrace is how long stopping waits for the trays to remove their icons (the service has 10 s to stop).
const trayGrace = 3 * time.Second

// stop ends the trays: they hold HomeAgent.exe open, which an update must replace.
func (t *trayService) stop() { t.manager.StopAll(trayGrace) }

// byName is how a tray request shows in the deployer's history: "<user> on <PC> (tray)".
func byName(session uint32) string {
	host, _ := os.Hostname()
	return fmt.Sprintf("%s on %s (tray)", winsession.UserOf(session), host)
}
