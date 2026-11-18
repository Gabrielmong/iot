package install

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// The install folder holds the running exe, so deleteLater must wait before removing it.
func TestDeleteLaterWaitsThenRemovesTheFolder(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "Home Agent") // a space, like Program Files
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "HomeAgent.exe"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := deleteLater(dir); err != nil {
		t.Fatal(err)
	}
	time.Sleep(time.Second)
	if _, err := os.Stat(dir); err != nil {
		t.Fatalf("removed before the delay: %v", err)
	}
	for deadline := time.Now().Add(10 * time.Second); time.Now().Before(deadline); time.Sleep(200 * time.Millisecond) {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			return
		}
	}
	t.Fatal("folder still there after 10 s")
}
