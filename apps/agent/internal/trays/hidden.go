package trays

import (
	"encoding/json"
	"os"
)

// Restore takes back the hidden sessions a previous run saved; ToLaunch drops those whose sign-in has ended.
func (p *Policy) Restore(saved map[uint32]int64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.init()
	for s, logon := range saved {
		p.hidden[s] = logon
	}
}

// LoadHidden reads the hidden sessions saved at path (none when it's missing or unreadable).
func LoadHidden(path string) map[uint32]int64 {
	data, err := os.ReadFile(path)
	if err != nil {
		return map[uint32]int64{}
	}
	var hidden map[uint32]int64
	if json.Unmarshal(data, &hidden) != nil || hidden == nil {
		return map[uint32]int64{}
	}
	return hidden
}

// SaveHidden writes the hidden sessions to path.
func SaveHidden(path string, hidden map[uint32]int64) error {
	data, err := json.Marshal(hidden)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}
