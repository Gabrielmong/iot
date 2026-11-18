// Package state keeps what the agent learned when it enrolled: the server, its device id and its token.
package state

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// State is the agent's identity with the server. Token is a secret.
type State struct {
	Server   string `json:"server"`
	DeviceID string `json:"deviceId"`
	Token    string `json:"token"`
	// Code is the one-time enrollment code, kept only between install and the first enrollment.
	Code string `json:"code,omitempty"`
}

// Load reads the state file; fs.ErrNotExist when the agent never enrolled.
func Load(path string) (State, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return State{}, err
	}
	var s State
	err = json.Unmarshal(raw, &s)
	return s, err
}

// Save writes the state file (creating its folder), replacing it atomically.
// The folder's ACL comes from ProtectDir, run at install.
func Save(path string, s State) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	raw, err := json.Marshal(s)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	// A file already there (planted, maybe a hard link) keeps its own ACL: never write through it.
	if err := os.Remove(tmp); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	_, werr := f.Write(raw)
	if cerr := f.Close(); werr == nil {
		werr = cerr
	}
	if werr != nil {
		return werr
	}
	return os.Rename(tmp, path)
}

// ForInstall is the state an install writes: the new download's server and code, keeping the current
// pairing (same server only) so a re-run of an already-used download can fall back to it.
func ForInstall(old State, server, code string) State {
	s := State{Server: server, Code: code}
	if old.Server == server {
		s.DeviceID, s.Token = old.DeviceID, old.Token
	}
	return s
}
