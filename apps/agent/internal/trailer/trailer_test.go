package trailer

import (
	"encoding/binary"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// withTrailer mirrors the server's trailer(): <json><uint32 LE len>"HOMEAGT1".
func withTrailer(body []byte, json string) []byte {
	out := append([]byte{}, body...)
	out = append(out, json...)
	out = binary.LittleEndian.AppendUint32(out, uint32(len(json)))
	return append(out, "HOMEAGT1"...)
}

func write(t *testing.T, data []byte) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "HomeAgent.exe")
	if err := os.WriteFile(p, data, 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestReadsTheServerAndCode(t *testing.T) {
	p := write(t, withTrailer([]byte("MZ fake exe bytes"), `{"server":"http://192.168.0.100:4000","code":"abc_DEF-123"}`))
	cfg, err := Read(p)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Server != "http://192.168.0.100:4000" || cfg.Code != "abc_DEF-123" {
		t.Fatalf("got %+v", cfg)
	}
}

func TestPlainExeHasNoTrailer(t *testing.T) {
	_, err := Read(write(t, []byte("MZ just an exe, nothing appended")))
	if !errors.Is(err, ErrNoTrailer) {
		t.Fatalf("got %v", err)
	}
}

func TestLengthBeyondTheFileIsNoTrailer(t *testing.T) {
	data := withTrailer(nil, `{"server":"http://x","code":"c"}`)
	binary.LittleEndian.PutUint32(data[len(data)-12:], 1<<20)
	if _, err := Read(write(t, data)); !errors.Is(err, ErrNoTrailer) {
		t.Fatalf("got %v", err)
	}
}

func TestMissingFieldsAreNoTrailer(t *testing.T) {
	if _, err := Read(write(t, withTrailer([]byte("MZ"), `{"server":"http://x"}`))); !errors.Is(err, ErrNoTrailer) {
		t.Fatalf("got %v", err)
	}
}

func TestLocateGivesTheExeLength(t *testing.T) {
	body := []byte("MZ fake exe bytes")
	_, n, err := Locate(write(t, withTrailer(body, `{"server":"http://x","code":"c"}`)))
	if err != nil || n != int64(len(body)) {
		t.Fatalf("got %d %v", n, err)
	}
}
