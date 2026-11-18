package win

import (
	"strconv"

	"homeagent/internal/tray"
	"homeagent/internal/traypipe"
)

const hideWait = 2000 // ms to wait for the service to note a hide before leaving anyway

// menu shows the right-click menu and does what was chosen.
func (a *app) menu() {
	id := popup(a.wnd, tray.Menu(a.status))
	switch id {
	case tray.IDOpenHome, tray.IDOpenPC, tray.IDOpenDeploys:
		open(tray.Target(a.status, id))
	case tray.IDRestart:
		if confirm(a.wnd, "Restart the Home server now?") {
			a.send(traypipe.ServerRestart, "restart")
		}
	case tray.IDDeploy:
		if confirm(a.wnd, "Deploy the latest version now?") {
			a.send(traypipe.ServerDeploy, "deploy")
		}
	case tray.IDCheck:
		a.send(traypipe.UpdateCheck, "check")
	case tray.IDHide:
		a.send(traypipe.TrayHide, "hide")
		procSetTimer.Call(uintptr(a.wnd), hideTimer, hideWait, 0)
	}
}

func (a *app) send(t, kind string) {
	a.nextID++
	id := strconv.Itoa(a.nextID)
	a.pending[id] = kind
	if err := a.conn.Send(traypipe.Request{T: t, ID: id}); err != nil {
		delete(a.pending, id)
		a.icon.balloon("Home", "Lost touch with the HomeAgent service", true)
	}
}

// drain handles the replies the reader queued.
func (a *app) drain() {
	a.mu.Lock()
	replies := a.queue
	a.queue = nil
	a.mu.Unlock()
	for _, r := range replies {
		switch r.T {
		case traypipe.StatusReply:
			if r.Status != nil {
				a.onStatus(*r.Status)
			}
		case traypipe.Result:
			a.onResult(r)
		}
	}
}

func (a *app) onStatus(s traypipe.Status) {
	a.status = s
	a.icon.show(tray.Dimmed(s), tray.Tooltip(s))
	if title, text, ok := a.watch.Next(s); ok {
		a.icon.balloon(title, text, s.ServerPC == nil || s.ServerPC.State != "running")
	}
}

func (a *app) onResult(r traypipe.Reply) {
	kind := a.pending[r.ID]
	delete(a.pending, r.ID)
	switch kind {
	case "hide":
		a.quit()
		return
	case "deploy", "restart":
		if r.OK {
			a.watch.Started(kind)
		}
	case "":
		return // not ours
	}
	if r.Message != "" {
		a.icon.balloon("Home", r.Message, !r.OK)
	}
}
