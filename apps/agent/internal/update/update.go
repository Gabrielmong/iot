// Package update replaces the agent with a newer build the server offers, after checking its SHA-256.
package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"homeagent/internal/protocol"
)

// maxSize bounds a download (the agent is a few MB).
const maxSize = 50 << 20

// NewExeName is the downloaded build, next to the installed one.
const NewExeName = "HomeAgent.new.exe"

// Updater downloads offered builds into Dir (the install folder: only admins can write there) and hands
// verified ones to Swap.
type Updater struct {
	Server  string // base URL; offers are fetched from this server only
	Dir     string
	Current int // this build's version
	Swap    func(newExe string) error
	HTTP    *http.Client
}

// Apply downloads, verifies and swaps in u. A bad hash deletes the download and keeps this build running.
func (up *Updater) Apply(ctx context.Context, u protocol.Update) error {
	if u.Version <= up.Current {
		return fmt.Errorf("offered version %d isn't newer than %d", u.Version, up.Current)
	}
	if !strings.HasPrefix(u.URL, "/") || strings.HasPrefix(u.URL, "//") {
		return fmt.Errorf("update URL %q isn't on this server", u.URL)
	}
	path := filepath.Join(up.Dir, NewExeName)
	if err := up.download(ctx, strings.TrimRight(up.Server, "/")+u.URL, path); err != nil {
		_ = os.Remove(path)
		return err
	}
	if err := Verify(path, u.Sha256); err != nil {
		_ = os.Remove(path)
		return err
	}
	return up.Swap(path)
}

func (up *Updater) download(ctx context.Context, url, path string) error {
	client := up.HTTP
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Minute}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: HTTP %d", res.StatusCode)
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	n, err := io.Copy(f, io.LimitReader(res.Body, maxSize+1))
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil && n > maxSize {
		err = errors.New("download too large")
	}
	return err
}

// Verify checks the file's SHA-256 against the hex digest.
func Verify(path, sha string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	if got := hex.EncodeToString(h.Sum(nil)); !strings.EqualFold(got, sha) {
		return fmt.Errorf("checksum mismatch: got %s, want %s", got, sha)
	}
	return nil
}
