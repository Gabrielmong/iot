package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"homeagent/internal/protocol"
)

var exe = []byte("MZ new agent build")

func hash(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}

func TestVerify(t *testing.T) {
	p := filepath.Join(t.TempDir(), "a.exe")
	_ = os.WriteFile(p, exe, 0o600)
	if err := Verify(p, hash(exe)); err != nil {
		t.Fatal(err)
	}
	if err := Verify(p, hash([]byte("other"))); err == nil {
		t.Fatal("wrong hash accepted")
	}
}

type fixture struct {
	u       *Updater
	swapped []string
	dir     string
}

func newFixture(t *testing.T, body []byte) *fixture {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agent/HomeAgent.exe" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	f := &fixture{dir: t.TempDir()}
	f.u = &Updater{Server: srv.URL, Dir: f.dir, Current: 1000, Swap: func(p string) error {
		f.swapped = append(f.swapped, p)
		return nil
	}}
	return f
}

func TestApplyBadHashNeverSwaps(t *testing.T) {
	f := newFixture(t, exe)
	err := f.u.Apply(context.Background(), protocol.Update{Version: 1001, URL: "/agent/HomeAgent.exe", Sha256: hash([]byte("tampered"))})
	if err == nil || len(f.swapped) != 0 {
		t.Fatalf("err %v swapped %v", err, f.swapped)
	}
	if entries, _ := os.ReadDir(f.dir); len(entries) != 0 {
		t.Fatalf("left %v behind", entries)
	}
}

func TestApplySwapsInTheVerifiedBuild(t *testing.T) {
	f := newFixture(t, exe)
	if err := f.u.Apply(context.Background(), protocol.Update{Version: 1001, URL: "/agent/HomeAgent.exe", Sha256: hash(exe)}); err != nil {
		t.Fatal(err)
	}
	if len(f.swapped) != 1 {
		t.Fatalf("swapped %v", f.swapped)
	}
	if got, _ := os.ReadFile(f.swapped[0]); string(got) != string(exe) {
		t.Fatalf("swapped in %q", got)
	}
}

func TestApplyIgnoresOlderOrSameVersions(t *testing.T) {
	f := newFixture(t, exe)
	if err := f.u.Apply(context.Background(), protocol.Update{Version: 1000, URL: "/agent/HomeAgent.exe", Sha256: hash(exe)}); err == nil || len(f.swapped) != 0 {
		t.Fatalf("err %v swapped %v", err, f.swapped)
	}
}

func TestApplyOnlyDownloadsFromItsServer(t *testing.T) {
	f := newFixture(t, exe)
	for _, url := range []string{"http://evil.example/HomeAgent.exe", "//evil.example/x", "agent/HomeAgent.exe"} {
		if err := f.u.Apply(context.Background(), protocol.Update{Version: 1001, URL: url, Sha256: hash(exe)}); err == nil {
			t.Errorf("%s accepted", url)
		}
	}
	if len(f.swapped) != 0 {
		t.Fatal("swapped")
	}
}
