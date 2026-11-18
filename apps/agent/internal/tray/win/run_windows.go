package win

import (
	"context"
	"runtime"
	"sync"

	"golang.org/x/sys/windows"

	"homeagent/internal/tray"
	"homeagent/internal/traypipe"
)

// app is the running tray; there is one per process (the window procedure needs to find it).
type app struct {
	conn           *traypipe.Conn
	wnd            windows.HWND
	icon           notifyIcon
	taskbarCreated uint32

	mu    sync.Mutex
	queue []traypipe.Reply // filled by the reader goroutine, drained on the window's thread

	status  traypipe.Status
	watch   tray.Watch
	pending map[string]string // request id → "check" | "deploy" | "restart" | "hide"
	nextID  int
}

var current *app

// Run is `HomeAgent.exe tray`: show the icon until the service goes away or the person hides it.
func Run() int {
	runtime.LockOSThread() // a window belongs to the thread that made it
	procSetProcessDPIAwareness.Call(dpiAwarenessPerMonitorAware)
	mutex, ok := singleInstance()
	if !ok {
		return 0
	}
	defer windows.CloseHandle(mutex)
	conn, err := traypipe.Dial(context.Background())
	if err != nil {
		return 1
	}
	defer conn.Close()
	a := &app{conn: conn, pending: map[string]string{}}
	current = a
	if a.wnd, err = newWindow(wndProc); err != nil {
		return 1
	}
	a.taskbarCreated = registerMessage("TaskbarCreated")
	a.icon = notifyIcon{wnd: a.wnd, on: loadIcon("APP"), off: loadIcon("OFF"), dimmed: true, tip: "Home"}
	a.icon.add() // if Explorer isn't up yet, TaskbarCreated adds it later
	go a.read()
	loop()
	a.icon.remove()
	return 0
}

// read hands every reply to the window's thread; when the service hangs up, the tray ends.
func (a *app) read() {
	for {
		r, err := a.conn.Read()
		if err != nil {
			post(a.wnd, wmGone)
			return
		}
		a.mu.Lock()
		a.queue = append(a.queue, r)
		a.mu.Unlock()
		post(a.wnd, wmReplies)
	}
}

func wndProc(wnd windows.HWND, m uint32, w, l uintptr) uintptr {
	a := current
	switch {
	case a == nil:
	case m == a.taskbarCreated && m != 0:
		a.icon.add()
		return 0
	case m == wmTrayIcon:
		switch iconEvent(l & 0xFFFF) {
		case clickOpen:
			open(tray.Target(a.status, tray.IDOpenHome))
		case clickMenu:
			a.menu()
		}
		return 0
	case m == wmReplies:
		a.drain()
		return 0
	case m == wmGone || (m == wmTimer && w == hideTimer):
		a.quit()
		return 0
	}
	return defWindowProc(wnd, m, w, l)
}

func (a *app) quit() {
	a.icon.remove()
	procPostQuitMessage.Call(0)
}
