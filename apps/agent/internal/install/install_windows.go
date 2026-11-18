// Package install puts the agent on a PC (from a paired download) and takes it off again.
package install

import (
	"errors"
	"io"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/svc/mgr"

	"homeagent/internal/eventlog"
	"homeagent/internal/paths"
	"homeagent/internal/state"
	"homeagent/internal/trailer"
)

// ErrNotPaired: this exe carries no pairing details (it wasn't downloaded through "Adopt this PC").
var ErrNotPaired = errors.New(`this copy of HomeAgent isn't paired with a home server. In the app, open the PC and choose "Adopt this PC" to download one`)

// Install copies this exe (without its trailer) to Program Files, stores the pairing code in the protected
// state folder, and registers and starts the service. Needs an elevated caller.
func Install() error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	cfg, size, err := trailer.Locate(self)
	if errors.Is(err, trailer.ErrNoTrailer) {
		return ErrNotPaired
	}
	if err != nil {
		return err
	}
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	if s, err := m.OpenService(paths.ServiceName); err == nil { // re-pairing: replace the running agent
		err = stopAndWait(s)
		s.Close()
		if err != nil {
			return err
		}
	}
	if err := copyExe(self, size, paths.InstalledExe()); err != nil {
		return err
	}
	if err := state.ProtectDir(paths.StateDir()); err != nil {
		return err
	}
	old, _ := state.Load(paths.StateFile()) // a missing or unreadable file means no pairing to keep
	if err := state.Save(paths.StateFile(), state.ForInstall(old, cfg.Server, cfg.Code)); err != nil {
		return err
	}
	if err := eventlog.Register(); err != nil {
		return err
	}
	s, err := register(m, paths.InstalledExe())
	if err != nil {
		return err
	}
	defer s.Close()
	return s.Start()
}

// copyExe writes the first size bytes of src (the exe without the trailer) to dst, via a temporary file.
func copyExe(src string, size int64, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".tmp"
	_ = os.Remove(tmp)
	out, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o755)
	if err != nil {
		return err
	}
	_, err = io.CopyN(out, in, size)
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, dst)
}
