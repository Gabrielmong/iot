package prompt

import (
	"encoding/binary"
	"runtime"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	comctl32          = windows.NewLazySystemDLL("comctl32.dll")
	procTaskDialogInd = comctl32.NewProc("TaskDialogIndirect") // only with the common-controls v6 manifest
	user32            = windows.NewLazySystemDLL("user32.dll")
	procSendMessage   = user32.NewProc("SendMessageW")
	procSetWindowPos  = user32.NewProc("SetWindowPos")
	procSetForeground = user32.NewProc("SetForegroundWindow")
	procMessageBox    = user32.NewProc("MessageBoxW")
)

const (
	idDoItNow = 1000
	idCancel  = 2 // IDCANCEL, so Esc and the close box cancel too

	tdnCreated = 0
	tdnTimer   = 4

	tdmClickButton    = 0x400 + 102
	tdmSetElementText = 0x400 + 108
	tdeMainInstr      = 2

	tdfAllowCancel   = 0x0008
	tdfCallbackTimer = 0x0800

	tdWarningIcon = 0xFFFF // TD_WARNING_ICON (MAKEINTRESOURCEW(-1))

	mbOKCancel      = 0x1
	mbIconWarning   = 0x30
	mbTopmost       = 0x40000
	mbSetForeground = 0x10000
	idOK            = 1
)

// Show displays the countdown and returns GoAhead (Do it now, or the time ran out) or Cancelled.
func Show(action, by string, seconds int) int {
	if procTaskDialogInd.Find() != nil {
		return messageBox(action, by, seconds)
	}
	return taskDialog(action, by, seconds)
}

func taskDialog(action, by string, seconds int) int {
	title := windows.StringToUTF16Ptr("HomeAgent")
	first := windows.StringToUTF16Ptr(Text(action, by, seconds))
	doIt := windows.StringToUTF16Ptr("Do it now")
	cancel := windows.StringToUTF16Ptr("Cancel")

	// TASKDIALOG_BUTTON is packed: int id, PCWSTR text (12 bytes each).
	buttons := make([]byte, 24)
	putButton(buttons[0:], idCancel, cancel)
	putButton(buttons[12:], idDoItNow, doIt)

	shown := seconds
	callback := windows.NewCallback(func(hwnd, msg, wParam, lParam, ref uintptr) uintptr {
		switch msg {
		case tdnCreated:
			const hwndTopmost, swpNoMoveSize = ^uintptr(0), 0x1 | 0x2 // HWND_TOPMOST, SWP_NOSIZE|SWP_NOMOVE
			procSetWindowPos.Call(hwnd, hwndTopmost, 0, 0, 0, 0, swpNoMoveSize)
			procSetForeground.Call(hwnd)
		case tdnTimer:
			left := seconds - int(wParam/1000)
			if left <= 0 {
				procSendMessage.Call(hwnd, tdmClickButton, idDoItNow, 0)
			} else if left != shown {
				shown = left
				text := windows.StringToUTF16Ptr(Text(action, by, left))
				procSendMessage.Call(hwnd, tdmSetElementText, tdeMainInstr, uintptr(unsafe.Pointer(text)))
				runtime.KeepAlive(text)
			}
		}
		return 0
	})

	// TASKDIALOGCONFIG is packed (pshpack1): offsets below are for x64.
	cfg := make([]byte, 160)
	le := binary.LittleEndian
	le.PutUint32(cfg[0:], 160)                                           // cbSize
	le.PutUint32(cfg[20:], tdfAllowCancel|tdfCallbackTimer)              // dwFlags
	le.PutUint64(cfg[28:], uint64(uintptr(unsafe.Pointer(title))))       // pszWindowTitle
	le.PutUint64(cfg[36:], tdWarningIcon)                                // pszMainIcon
	le.PutUint64(cfg[44:], uint64(uintptr(unsafe.Pointer(first))))       // pszMainInstruction
	le.PutUint32(cfg[60:], 2)                                            // cButtons
	le.PutUint64(cfg[64:], uint64(uintptr(unsafe.Pointer(&buttons[0])))) // pButtons
	le.PutUint32(cfg[72:], idCancel)                                     // nDefaultButton
	le.PutUint64(cfg[140:], uint64(callback))                            // pfCallback

	var pressed int32
	r, _, _ := procTaskDialogInd.Call(uintptr(unsafe.Pointer(&cfg[0])), uintptr(unsafe.Pointer(&pressed)), 0, 0)
	runtime.KeepAlive(title)
	runtime.KeepAlive(first)
	runtime.KeepAlive(doIt)
	runtime.KeepAlive(cancel)
	runtime.KeepAlive(buttons)
	if r != 0 { // a failed HRESULT: fall back rather than act unseen
		return messageBox(action, by, seconds)
	}
	if pressed == idDoItNow {
		return GoAhead
	}
	return Cancelled
}

func putButton(b []byte, id int32, text *uint16) {
	binary.LittleEndian.PutUint32(b[0:], uint32(id))
	binary.LittleEndian.PutUint64(b[4:], uint64(uintptr(unsafe.Pointer(text))))
}

// messageBox is the fallback without a live countdown: OK goes ahead; the service ends it when time runs out.
func messageBox(action, by string, seconds int) int {
	text := windows.StringToUTF16Ptr(Text(action, by, seconds) + "\n\nOK does it now; Cancel stops it.")
	title := windows.StringToUTF16Ptr("HomeAgent")
	r, _, _ := procMessageBox.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), mbOKCancel|mbIconWarning|mbTopmost|mbSetForeground)
	runtime.KeepAlive(text)
	runtime.KeepAlive(title)
	if r == idOK {
		return GoAhead
	}
	return Cancelled
}
