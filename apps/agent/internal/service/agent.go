// Package service is the HomeAgent Windows service: it enrolls, stays connected, and carries out what the server asks.
package service

import (
	"context"
	"fmt"
	"time"

	"homeagent/internal/client"
	"homeagent/internal/protocol"
)

// minStatsInterval keeps a misbehaving server from asking for samples faster than once a second.
const minStatsInterval = time.Second

// Sampler is stats.Sampler as the agent uses it.
type Sampler interface {
	Start(interval time.Duration)
	Stop()
}

// Power is power.Runner as the agent uses it.
type Power interface {
	Handle(p protocol.Power, report func(protocol.PowerState))
	Cancel(id string)
}

// AgentEvents hears about the connection and update answers (the tray hub); optional.
type AgentEvents interface {
	Connected(bool)
	UpdateOffered(version int)
	UpdateNone(version int)
}

// Agent turns the server's messages into work (it is the client.Handler).
type Agent struct {
	Send      func(protocol.Outgoing) bool
	Sampler   Sampler
	Power     Power
	Update    func(context.Context, protocol.Update) error
	Uninstall func() error // removes the service and files (the service keeps running until Stop)
	Stop      func()       // ends the service
	Log       client.Logger
	Events    AgentEvents // nil: nobody listens
}

var _ client.Handler = (*Agent)(nil)

func (a *Agent) OnStatsStart(intervalMs int) {
	a.Sampler.Start(max(time.Duration(intervalMs)*time.Millisecond, minStatsInterval))
}

func (a *Agent) OnStatsStop() { a.Sampler.Stop() }
func (a *Agent) OnDisconnected() {
	a.Sampler.Stop()
	if a.Events != nil {
		a.Events.Connected(false)
	}
}

func (a *Agent) OnConnected() {
	if a.Events != nil {
		a.Events.Connected(true)
	}
}

func (a *Agent) OnUpdateNone(u protocol.UpdateNone) {
	if a.Events != nil {
		a.Events.UpdateNone(u.Version)
	}
}

func (a *Agent) OnPower(p protocol.Power) {
	a.Log.Info(fmt.Sprintf("%s requested by %s (%d s countdown)", p.Action, p.RequestedBy, p.Seconds))
	a.Power.Handle(p, func(s protocol.PowerState) { a.Send(s) })
}

func (a *Agent) OnPowerCancel(id string) { a.Power.Cancel(id) }

// OnUninstall: the PC was removed from the app. Acknowledge, remove everything, stop.
func (a *Agent) OnUninstall() {
	a.Sampler.Stop()
	a.Send(protocol.UninstallAck{})
	if err := a.Uninstall(); err != nil {
		a.Log.Error("uninstall failed: " + err.Error())
	}
	a.Stop()
}

// OnUpdate downloads and swaps in the offered build in the background; a failure keeps this build running.
func (a *Agent) OnUpdate(u protocol.Update) {
	if a.Events != nil {
		a.Events.UpdateOffered(u.Version)
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		if err := a.Update(ctx, u); err != nil {
			a.Log.Error(fmt.Sprintf("update to version %d failed: %v", u.Version, err))
			return
		}
		a.Log.Info(fmt.Sprintf("updating to version %d", u.Version))
	}()
}
