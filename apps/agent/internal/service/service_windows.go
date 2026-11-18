package service

import (
	"context"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/sys/windows/svc"

	"homeagent/internal/client"
	"homeagent/internal/eventlog"
	"homeagent/internal/install"
	"homeagent/internal/paths"
	"homeagent/internal/power"
	"homeagent/internal/protocol"
	"homeagent/internal/state"
	"homeagent/internal/stats"
	"homeagent/internal/update"
)

// Run hands this process to the Service Control Manager until the service stops.
func Run(version int) error {
	return svc.Run(paths.ServiceName, &handler{version: version})
}

type handler struct{ version int }

func (h *handler) Execute(_ []string, req <-chan svc.ChangeRequest, status chan<- svc.Status) (bool, uint32) {
	status <- svc.Status{State: svc.StartPending}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		run(ctx, cancel, h.version)
	}()
	status <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}
	for {
		select {
		case <-done:
			status <- svc.Status{State: svc.StopPending}
			return false, 0
		case c := <-req:
			switch c.Cmd {
			case svc.Interrogate:
				status <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				status <- svc.Status{State: svc.StopPending}
				cancel()
				select {
				case <-done:
				case <-time.After(10 * time.Second):
				}
				return false, 0
			}
		}
	}
}

// run is the agent's life: enroll if needed, then stay connected until ctx ends (or the PC is removed).
func run(ctx context.Context, stop context.CancelFunc, version int) {
	log := eventlog.Open()
	_ = os.Remove(filepath.Join(paths.InstallDir(), update.NewExeName)) // left by the previous update
	st, err := state.Load(paths.StateFile())
	if err != nil {
		log.Error("can't read the agent's settings: " + err.Error())
		return
	}
	info := hello(version)
	if st, err = ensureEnrolled(ctx, st, info, log); err != nil {
		if ctx.Err() == nil {
			log.Error(err.Error())
		}
		return
	}

	var c *client.Client
	send := func(m protocol.Outgoing) bool { return c != nil && c.Send(m) }
	updater := &update.Updater{
		Server:  st.Server,
		Dir:     paths.InstallDir(),
		Current: version,
		Swap:    func(newExe string) error { return update.Swap(newExe, paths.InstalledExe()) },
	}
	agent := &Agent{
		Send:      send,
		Sampler:   stats.NewSampler(stats.NewCollector(stats.DefaultSources()), func(s protocol.Stats) { send(s) }),
		Power:     &power.Runner{Exec: power.Exec, Launch: power.Launch, Session: power.CurrentSession, Log: log.Info},
		Update:    updater.Apply,
		Uninstall: install.FromService,
		Stop:      stop,
		Log:       log,
	}
	c = client.New(client.Config{Server: st.Server, Token: st.Token, Log: log}, agent, info)
	log.Info("HomeAgent started")
	_ = c.Run(ctx)
	agent.Sampler.Stop()
}
