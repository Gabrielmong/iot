// Package win is the tray icon's Windows side: the notification-area icon, its menu, balloons and the window
// that receives their messages. What to show comes from package tray; this package only draws it.
package win

import "golang.org/x/sys/windows"

var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	shell32  = windows.NewLazySystemDLL("shell32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")

	procRegisterClassEx         = user32.NewProc("RegisterClassExW")
	procCreateWindowEx          = user32.NewProc("CreateWindowExW")
	procDefWindowProc           = user32.NewProc("DefWindowProcW")
	procGetMessage              = user32.NewProc("GetMessageW")
	procTranslateMessage        = user32.NewProc("TranslateMessage")
	procDispatchMessage         = user32.NewProc("DispatchMessageW")
	procPostMessage             = user32.NewProc("PostMessageW")
	procPostQuitMessage         = user32.NewProc("PostQuitMessage")
	procRegisterWindowMessage   = user32.NewProc("RegisterWindowMessageW")
	procCreatePopupMenu         = user32.NewProc("CreatePopupMenu")
	procAppendMenu              = user32.NewProc("AppendMenuW")
	procTrackPopupMenu          = user32.NewProc("TrackPopupMenu")
	procDestroyMenu             = user32.NewProc("DestroyMenu")
	procSetForegroundWindow     = user32.NewProc("SetForegroundWindow")
	procGetCursorPos            = user32.NewProc("GetCursorPos")
	procLoadImage               = user32.NewProc("LoadImageW")
	procLoadIcon                = user32.NewProc("LoadIconW")
	procGetSystemMetrics        = user32.NewProc("GetSystemMetrics")
	procMessageBox              = user32.NewProc("MessageBoxW")
	procSetTimer                = user32.NewProc("SetTimer")
	procShellNotifyIcon         = shell32.NewProc("Shell_NotifyIconW")
	procGetModuleHandle         = kernel32.NewProc("GetModuleHandleW")
	procSetProcessDPIAwareness  = user32.NewProc("SetProcessDpiAwarenessContext")
	dpiAwarenessPerMonitorAware = ^uintptr(3) // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 (-4)
)

const (
	wmCommand    = 0x0111
	wmTimer      = 0x0113
	wmContextMnu = 0x007B
	wmLButtonUp  = 0x0202
	wmApp        = 0x8000

	wmTrayIcon = wmApp + 1 // the icon's callback
	wmReplies  = wmApp + 2 // replies are waiting in the queue
	wmGone     = wmApp + 3 // the service hung up

	ninSelect    = 0x0400
	ninKeySelect = 0x0401

	mfString    = 0x0000
	mfGrayed    = 0x0001
	mfSeparator = 0x0800

	tpmRightButton = 0x0002
	tpmReturnCmd   = 0x0100
	tpmNoNotify    = 0x0080

	imageIcon       = 1
	smCxSmIcon      = 49
	smCySmIcon      = 50
	idiApplication  = 32512
	mbYesNo         = 0x04
	mbIconQuestion  = 0x20
	mbSetForeground = 0x10000
	idYes           = 6

	hideTimer = 1
)

type point struct{ X, Y int32 }

type msg struct {
	HWnd    windows.HWND
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      point
	private uint32
}

type wndClassEx struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   windows.Handle
	Icon       windows.Handle
	Cursor     windows.Handle
	Background windows.Handle
	MenuName   *uint16
	ClassName  *uint16
	IconSm     windows.Handle
}

func utf16(s string) *uint16 { return windows.StringToUTF16Ptr(s) }

func moduleHandle() windows.Handle {
	h, _, _ := procGetModuleHandle.Call(0)
	return windows.Handle(h)
}
