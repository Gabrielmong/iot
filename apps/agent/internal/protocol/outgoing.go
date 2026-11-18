package protocol

import "encoding/json"

// Outgoing is one agent → server message.
type Outgoing interface{ msgType() string }

// Hello is sent first on every connection.
type Hello struct {
	Version  int      `json:"version"`
	Hostname string   `json:"hostname"`
	IPs      []string `json:"ips"`
	MACs     []string `json:"macs"`
	WakeMAC  string   `json:"wakeMac"`
	OS       string   `json:"os"`
}

// Heartbeat keeps the connection counted as alive (every 30 s).
type Heartbeat struct{}

// Gpu is the first GPU's load (%) and temperature (°C).
type Gpu struct {
	Name  string  `json:"name"`
	Load  float64 `json:"load"`
	TempC float64 `json:"tempC"`
}

// Disk is one fixed drive, in bytes.
type Disk struct {
	Mount string  `json:"mount"`
	Free  float64 `json:"free"`
	Total float64 `json:"total"`
}

// Stats is one live sample: percent, bytes, bytes per second, seconds.
type Stats struct {
	CPU      float64 `json:"cpu"`
	RAMUsed  float64 `json:"ramUsed"`
	RAMTotal float64 `json:"ramTotal"`
	Gpu      *Gpu    `json:"gpu,omitempty"`
	Disks    []Disk  `json:"disks"`
	NetUp    float64 `json:"netUp"`
	NetDown  float64 `json:"netDown"`
	UptimeS  int64   `json:"uptimeS"`
	User     *string `json:"user,omitempty"`
	IdleS    *int64  `json:"idleS,omitempty"`
}

// PowerState reports a power request's progress: countdown | cancelled | executing | skipped.
type PowerState struct {
	ID          string `json:"id"`
	Phase       string `json:"phase"`
	SecondsLeft *int   `json:"secondsLeft,omitempty"`
}

// UninstallAck confirms the agent is removing itself.
type UninstallAck struct{}

// UpdateCheck asks the server for a newer agent than Version (answered with update or update.none).
type UpdateCheck struct {
	Version int `json:"version"`
}

func (UpdateCheck) msgType() string  { return "update.check" }
func (Hello) msgType() string        { return "hello" }
func (Heartbeat) msgType() string    { return "heartbeat" }
func (Stats) msgType() string        { return "stats" }
func (PowerState) msgType() string   { return "power.state" }
func (UninstallAck) msgType() string { return "uninstall.ack" }

// Encode renders msg as {"v":1,"t":<type>, ...fields}.
func Encode(msg Outgoing) []byte {
	fields, _ := json.Marshal(msg) // these structs always marshal
	head, _ := json.Marshal(struct {
		V int    `json:"v"`
		T string `json:"t"`
	}{Version, msg.msgType()})
	if string(fields) == "{}" {
		return head
	}
	return append(append(head[:len(head)-1], ','), fields[1:]...)
}
