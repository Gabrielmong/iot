package win

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	nimAdd        = 0
	nimModify     = 1
	nimDelete     = 2
	nimSetVersion = 4

	nifMessage  = 0x01
	nifIcon     = 0x02
	nifTip      = 0x04
	nifInfo     = 0x10
	nifShowTip  = 0x80
	niifInfo    = 0x01
	niifWarning = 0x02

	notifyIconVersion4 = 4
)

// notifyIconData is NOTIFYICONDATAW.
type notifyIconData struct {
	Size            uint32
	Wnd             windows.HWND
	ID              uint32
	Flags           uint32
	CallbackMessage uint32
	Icon            windows.Handle
	Tip             [128]uint16
	State           uint32
	StateMask       uint32
	Info            [256]uint16
	Version         uint32 // union with uTimeout
	InfoTitle       [64]uint16
	InfoFlags       uint32
	GUIDItem        windows.GUID
	BalloonIcon     windows.Handle
}

// notifyIcon is this tray's one icon in the notification area.
type notifyIcon struct {
	wnd       windows.HWND
	on, off   windows.Handle
	dimmed    bool
	tip       string
	installed bool
}

func (n *notifyIcon) data(flags uint32) notifyIconData {
	d := notifyIconData{Wnd: n.wnd, ID: 1, Flags: flags, CallbackMessage: wmTrayIcon}
	d.Size = uint32(unsafe.Sizeof(d))
	d.Icon = n.on
	if n.dimmed {
		d.Icon = n.off
	}
	copyUTF16(d.Tip[:], n.tip)
	return d
}

func (n *notifyIcon) call(op uintptr, d *notifyIconData) bool {
	r, _, _ := procShellNotifyIcon.Call(op, uintptr(unsafe.Pointer(d)))
	return r != 0
}

// add puts the icon in the notification area (again, after Explorer restarted).
func (n *notifyIcon) add() {
	d := n.data(nifMessage | nifIcon | nifTip | nifShowTip)
	n.installed = n.call(nimAdd, &d)
	d.Version = notifyIconVersion4
	n.call(nimSetVersion, &d)
}

// show updates the icon's look and tooltip.
func (n *notifyIcon) show(dimmed bool, tip string) {
	if n.dimmed == dimmed && n.tip == tip {
		return
	}
	n.dimmed, n.tip = dimmed, tip
	d := n.data(nifIcon | nifTip | nifShowTip)
	n.call(nimModify, &d)
}

// balloon shows a notification next to the icon.
func (n *notifyIcon) balloon(title, text string, warning bool) {
	d := n.data(nifInfo)
	copyUTF16(d.InfoTitle[:], title)
	copyUTF16(d.Info[:], text)
	d.InfoFlags = niifInfo
	if warning {
		d.InfoFlags = niifWarning
	}
	n.call(nimModify, &d)
}

// remove takes the icon away (so no ghost icon is left behind).
func (n *notifyIcon) remove() {
	if !n.installed {
		return
	}
	d := n.data(0)
	n.call(nimDelete, &d)
	n.installed = false
}

// copyUTF16 copies s into a fixed, NUL-terminated buffer, cutting it short if needed.
func copyUTF16(dst []uint16, s string) {
	src, _ := windows.UTF16FromString(s)
	if len(src) > len(dst) {
		src = src[:len(dst)]
		src[len(src)-1] = 0
	}
	copy(dst, src)
}

// loadIcon loads a small icon from this exe's resources, or the generic application icon (dev builds).
func loadIcon(name string) windows.Handle {
	cx, _, _ := procGetSystemMetrics.Call(smCxSmIcon)
	cy, _, _ := procGetSystemMetrics.Call(smCySmIcon)
	h, _, _ := procLoadImage.Call(uintptr(moduleHandle()), uintptr(unsafe.Pointer(utf16(name))), imageIcon, cx, cy, 0)
	if h != 0 {
		return windows.Handle(h)
	}
	h, _, _ = procLoadIcon.Call(0, idiApplication)
	return windows.Handle(h)
}
