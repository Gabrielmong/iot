// Package protocol is the HomeAgent wire protocol, v1: one JSON object per WebSocket message.
// The set is closed: there is no message that runs arbitrary commands.
package protocol

import (
	"encoding/json"
	"errors"
	"fmt"
)

// Version is the protocol version every message carries as "v".
const Version = 1

// ErrUnknown is a well-formed v1 message of a type this agent doesn't know (ignored and logged).
var ErrUnknown = errors.New("unknown message type")

// Message is one server → agent message.
type Message interface{ isMessage() }

// StatsStart asks for a stats sample every IntervalMs.
type StatsStart struct {
	IntervalMs int `json:"intervalMs"`
}

// StatsStop ends sampling.
type StatsStop struct{}

// Power asks for a sleep, shut down or restart behind a Seconds countdown.
type Power struct {
	ID          string `json:"id"`
	Action      string `json:"action"` // sleep | shutdown | restart
	RequestedBy string `json:"requestedBy"`
	Seconds     int    `json:"seconds"`
}

// PowerCancel cancels the countdown of request ID.
type PowerCancel struct {
	ID string `json:"id"`
}

// Uninstall: the PC was removed from the app.
type Uninstall struct{}

// Update offers a newer agent at URL (relative to the server) with this SHA-256.
type Update struct {
	Version int    `json:"version"`
	URL     string `json:"url"`
	Sha256  string `json:"sha256"`
}

func (StatsStart) isMessage()  {}
func (StatsStop) isMessage()   {}
func (Power) isMessage()       {}
func (PowerCancel) isMessage() {}
func (Uninstall) isMessage()   {}
func (Update) isMessage()      {}

// A power request's countdown must be 10 s to an hour: never skipped, never absurd.
const (
	MinCountdown = 10
	MaxCountdown = 3600
)

var powerActions = map[string]bool{"sleep": true, "shutdown": true, "restart": true}

// Decode parses one server message; an error for another version, bad JSON or bad fields, ErrUnknown for an unknown type.
func Decode(raw []byte) (Message, error) {
	var head struct {
		V int    `json:"v"`
		T string `json:"t"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		return nil, err
	}
	if head.V != Version {
		return nil, fmt.Errorf("protocol version %d", head.V)
	}
	switch head.T {
	case "stats.start":
		return decodeAs[StatsStart](raw)
	case "stats.stop":
		return StatsStop{}, nil
	case "power":
		p, err := decodeAs[Power](raw)
		if err == nil && (!powerActions[p.Action] || p.ID == "" || p.Seconds < MinCountdown || p.Seconds > MaxCountdown) {
			return nil, fmt.Errorf("bad power request")
		}
		return p, err
	case "power.cancel":
		return decodeAs[PowerCancel](raw)
	case "uninstall":
		return Uninstall{}, nil
	case "update":
		return decodeAs[Update](raw)
	default:
		return nil, fmt.Errorf("%w: %q", ErrUnknown, head.T)
	}
}

func decodeAs[T Message](raw []byte) (T, error) {
	var m T
	err := json.Unmarshal(raw, &m)
	return m, err
}
