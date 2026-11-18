package win

import "testing"

// With NOTIFYICON_VERSION_4 one left click sends both WM_LBUTTONUP and NIN_SELECT; only one may open Home.
func TestOneLeftClickOpensHomeOnce(t *testing.T) {
	opens := 0
	for _, e := range []uintptr{wmLButtonUp, ninSelect} {
		if iconEvent(e) == clickOpen {
			opens++
		}
	}
	if opens != 1 {
		t.Fatalf("a left click opens Home %d times, want 1", opens)
	}
	if iconEvent(ninKeySelect) != clickOpen {
		t.Fatal("Enter on the icon should open Home")
	}
	if iconEvent(wmContextMnu) != clickMenu {
		t.Fatal("right click should show the menu")
	}
}
