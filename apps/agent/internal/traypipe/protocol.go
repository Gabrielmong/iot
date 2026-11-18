// Package traypipe is the protocol between the tray (HomeAgent.exe tray, as the signed-in user) and the
// HomeAgent service, over the named pipe \\.\pipe\HomeAgent.tray: one JSON object per line, v1, a closed set.
package traypipe

import (
	"encoding/json"
	"errors"
	"fmt"
)

// PipeName is the service's pipe.
const PipeName = `\\.\pipe\HomeAgent.tray`

// Version is the protocol version every line carries as "v".
const Version = 1

// MaxLine caps one message.
const MaxLine = 64 << 10

// ErrUnknown is a well-formed v1 line of a type this side doesn't know.
var ErrUnknown = errors.New("unknown message type")

// Request types (tray → service).
const (
	StatusGet     = "status.get"
	UpdateCheck   = "update.check"
	ServerRestart = "server.restart"
	ServerDeploy  = "server.deploy"
	TrayHide      = "tray.hide"
)

// Reply types (service → tray).
const (
	StatusReply = "status"
	Result      = "result"
)

var requestTypes = map[string]bool{StatusGet: true, UpdateCheck: true, ServerRestart: true, ServerDeploy: true, TrayHide: true}
var replyTypes = map[string]bool{StatusReply: true, Result: true}

// Status is everything the tray shows.
type Status struct {
	Version   int          `json:"version"`
	Connected bool         `json:"connected"`
	Server    string       `json:"server"`
	DeviceID  string       `json:"deviceId"`
	ServerPC  *ServerState `json:"serverPc,omitempty"` // only on the server PC
}

// ServerState is the Home server on this PC: State is a serverpc.State.
type ServerState struct {
	State string `json:"state"`
	Label string `json:"label,omitempty"`
	Sha   string `json:"sha,omitempty"`
}

// Request is one tray → service message; ID ties a result to it.
type Request struct {
	T  string `json:"t"`
	ID string `json:"id,omitempty"`
}

// Reply is one service → tray message: a status, or the result of request ID.
type Reply struct {
	T       string  `json:"t"`
	Status  *Status `json:"status,omitempty"`
	ID      string  `json:"id,omitempty"`
	OK      bool    `json:"ok,omitempty"`
	Message string  `json:"message,omitempty"`
}

// encode renders {"v":1, ...fields}\n.
func encode(m any) []byte {
	fields, _ := json.Marshal(m) // these structs always marshal
	out := append([]byte(fmt.Sprintf(`{"v":%d,`, Version)), fields[1:]...)
	return append(out, '\n')
}

func decode[T any](line []byte, typeOf func(T) string, known map[string]bool) (T, error) {
	var zero, m T
	var head struct {
		V int `json:"v"`
	}
	if err := json.Unmarshal(line, &head); err != nil {
		return zero, err
	}
	if head.V != Version {
		return zero, fmt.Errorf("protocol version %d", head.V)
	}
	if err := json.Unmarshal(line, &m); err != nil {
		return zero, err
	}
	if t := typeOf(m); !known[t] {
		return zero, fmt.Errorf("%w: %q", ErrUnknown, t)
	}
	return m, nil
}

func EncodeRequest(r Request) []byte { return encode(r) }
func EncodeReply(r Reply) []byte     { return encode(r) }

func DecodeRequest(line []byte) (Request, error) {
	return decode(line, func(r Request) string { return r.T }, requestTypes)
}

func DecodeReply(line []byte) (Reply, error) {
	return decode(line, func(r Reply) string { return r.T }, replyTypes)
}
