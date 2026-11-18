package client

import "homeagent/internal/protocol"

// Handler receives the server's messages, one call per message, on the connection's reader goroutine.
// Implementations hand long work (countdowns, sampling, downloads) to their own goroutines.
type Handler interface {
	OnStatsStart(intervalMs int)
	OnStatsStop()
	OnPower(p protocol.Power)
	OnPowerCancel(id string)
	OnUninstall()
	OnUpdate(u protocol.Update)
	// OnDisconnected: the connection dropped; stop anything that only makes sense while connected (sampling).
	OnDisconnected()
}

// Logger is where the client reports what happened (the Windows event log in the service).
type Logger interface {
	Info(msg string)
	Error(msg string)
}

func dispatch(h Handler, m protocol.Message) {
	switch m := m.(type) {
	case protocol.StatsStart:
		h.OnStatsStart(m.IntervalMs)
	case protocol.StatsStop:
		h.OnStatsStop()
	case protocol.Power:
		h.OnPower(m)
	case protocol.PowerCancel:
		h.OnPowerCancel(m.ID)
	case protocol.Uninstall:
		h.OnUninstall()
	case protocol.Update:
		h.OnUpdate(m)
	}
}
