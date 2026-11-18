// Package trailer reads the pairing details the server appends to a downloaded HomeAgent.exe.
package trailer

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"os"
)

const magic = "HOMEAGT1"

// maxJSON bounds what a trailer may claim, so a corrupt length never makes us read the whole exe.
const maxJSON = 64 << 10

// ErrNoTrailer means the exe carries no (usable) pairing details: it was not downloaded through "Adopt this PC".
var ErrNoTrailer = errors.New("no pairing details in this exe")

// Config is what one download pairs: the server's base URL and a one-time enrollment code.
type Config struct {
	Server string `json:"server"`
	Code   string `json:"code"`
}

// Read returns the trailer of the file at path: <json><uint32 LE json length>"HOMEAGT1".
func Read(path string) (Config, error) {
	cfg, _, err := Locate(path)
	return cfg, err
}

// Locate is Read plus how many bytes come before the trailer (the exe itself).
func Locate(path string) (Config, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return Config{}, 0, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return Config{}, 0, err
	}
	size := info.Size()
	if size < 12 {
		return Config{}, 0, ErrNoTrailer
	}
	tail := make([]byte, 12)
	if _, err := f.ReadAt(tail, size-12); err != nil {
		return Config{}, 0, err
	}
	if string(tail[4:]) != magic {
		return Config{}, 0, ErrNoTrailer
	}
	n := int64(binary.LittleEndian.Uint32(tail[:4]))
	if n == 0 || n > maxJSON || n > size-12 {
		return Config{}, 0, ErrNoTrailer
	}
	raw := make([]byte, n)
	if _, err := f.ReadAt(raw, size-12-n); err != nil && !errors.Is(err, io.EOF) {
		return Config{}, 0, err
	}
	var cfg Config
	if json.Unmarshal(raw, &cfg) != nil || cfg.Server == "" || cfg.Code == "" {
		return Config{}, 0, ErrNoTrailer
	}
	return cfg, size - 12 - n, nil
}
