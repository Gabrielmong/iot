package win

// click is what an icon event asks for.
type click int

const (
	clickNone click = iota
	clickOpen
	clickMenu
)

// iconEvent maps the low word of a wmTrayIcon lParam to what the tray does. With NOTIFYICON_VERSION_4 a left
// click sends WM_LBUTTONUP and then NIN_SELECT, so only NIN_SELECT (and NIN_KEYSELECT, for Enter) opens Home.
func iconEvent(e uintptr) click {
	switch e {
	case ninSelect, ninKeySelect:
		return clickOpen
	case wmContextMnu:
		return clickMenu
	}
	return clickNone
}
