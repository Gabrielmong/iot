package win

import (
	"unsafe"

	"golang.org/x/sys/windows"

	"homeagent/internal/tray"
)

// popup shows items at the cursor and returns the chosen item (0: none).
func popup(wnd windows.HWND, items []tray.Item) tray.ItemID {
	m, _, _ := procCreatePopupMenu.Call()
	if m == 0 {
		return 0
	}
	defer procDestroyMenu.Call(m)
	for _, it := range items {
		if it.Separator {
			procAppendMenu.Call(m, mfSeparator, 0, 0)
			continue
		}
		flags := uintptr(mfString)
		if it.Disabled {
			flags |= mfGrayed
		}
		procAppendMenu.Call(m, flags, uintptr(it.ID), uintptr(unsafe.Pointer(utf16(it.Label))))
	}
	var pt point
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	procSetForegroundWindow.Call(uintptr(wnd)) // otherwise the menu doesn't close when clicking elsewhere
	id, _, _ := procTrackPopupMenu.Call(m, tpmRightButton|tpmReturnCmd|tpmNoNotify, uintptr(pt.X), uintptr(pt.Y), 0, uintptr(wnd), 0)
	return tray.ItemID(id)
}

// confirm asks a yes/no question; true for Yes.
func confirm(wnd windows.HWND, text string) bool {
	r, _, _ := procMessageBox.Call(uintptr(wnd), uintptr(unsafe.Pointer(utf16(text))), uintptr(unsafe.Pointer(utf16("Home"))),
		mbYesNo|mbIconQuestion|mbSetForeground)
	return r == idYes
}

// open shows url in the default browser.
func open(url string) {
	if url == "" {
		return
	}
	_ = windows.ShellExecute(0, utf16("open"), utf16(url), nil, nil, windows.SW_SHOWNORMAL)
}
