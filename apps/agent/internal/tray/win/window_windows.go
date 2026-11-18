package win

import (
	"errors"
	"unsafe"

	"golang.org/x/sys/windows"
)

const className = "HomeAgentTray"

// newWindow creates the hidden window that receives the icon's messages. It is a normal (never shown)
// top-level window rather than a message-only one: only those receive the TaskbarCreated broadcast.
func newWindow(proc func(windows.HWND, uint32, uintptr, uintptr) uintptr) (windows.HWND, error) {
	inst := moduleHandle()
	wc := wndClassEx{WndProc: windows.NewCallback(proc), Instance: inst, ClassName: utf16(className)}
	wc.Size = uint32(unsafe.Sizeof(wc))
	if r, _, err := procRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc))); r == 0 {
		return 0, err
	}
	h, _, err := procCreateWindowEx.Call(0, uintptr(unsafe.Pointer(utf16(className))), uintptr(unsafe.Pointer(utf16("HomeAgent"))),
		0, 0, 0, 0, 0, 0, 0, uintptr(inst), 0)
	if h == 0 {
		return 0, err
	}
	return windows.HWND(h), nil
}

func defWindowProc(wnd windows.HWND, m uint32, w, l uintptr) uintptr {
	r, _, _ := procDefWindowProc.Call(uintptr(wnd), uintptr(m), w, l)
	return r
}

// loop runs the message loop until PostQuitMessage.
func loop() {
	var m msg
	for {
		r, _, _ := procGetMessage.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 {
			return
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessage.Call(uintptr(unsafe.Pointer(&m)))
	}
}

func post(wnd windows.HWND, m uint32) { procPostMessage.Call(uintptr(wnd), uintptr(m), 0, 0) }

func registerMessage(name string) uint32 {
	r, _, _ := procRegisterWindowMessage.Call(uintptr(unsafe.Pointer(utf16(name))))
	return uint32(r)
}

// singleInstance holds a per-session mutex; false when another tray already runs in this session.
func singleInstance() (windows.Handle, bool) {
	h, err := windows.CreateMutex(nil, false, utf16(`Local\HomeAgentTray`))
	if errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		if h != 0 {
			windows.CloseHandle(h)
		}
		return 0, false
	}
	return h, err == nil
}
