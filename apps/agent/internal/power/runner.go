package power

import (
	"sync"
	"time"

	"homeagent/internal/protocol"
)

// Process is a running countdown prompt: Wait returns its exit code (0 = go ahead, anything else = cancelled).
type Process interface {
	Wait() int
	Kill()
}

// Runner carries out one power request at a time. Exec and Launch are the Windows side (fakes in tests).
type Runner struct {
	Exec        func(action string) error
	Launch      func(action, requestedBy string, seconds int) (Process, error)
	Session     func() Session
	Log         func(msg string)
	ReportEvery time.Duration // countdown progress to the server; default 10 s
	Grace       time.Duration // how long past the deadline a prompt may stay open; default 5 s

	mu     sync.Mutex
	active *job
}

type job struct {
	id     string
	cancel chan struct{}
	once   sync.Once
}

func (j *job) stop() { j.once.Do(func() { close(j.cancel) }) }

// Handle starts a request and returns at once; progress goes to report. A request while another runs is skipped.
func (r *Runner) Handle(p protocol.Power, report func(protocol.PowerState)) {
	r.mu.Lock()
	if r.active != nil {
		r.mu.Unlock()
		report(protocol.PowerState{ID: p.ID, Phase: "skipped"})
		return
	}
	j := &job{id: p.ID, cancel: make(chan struct{})}
	r.active = j
	r.mu.Unlock()
	go func() {
		defer r.finish(j)
		r.run(j, p, report)
	}()
}

// Cancel stops the countdown of request id (from the app); other ids are ignored.
func (r *Runner) Cancel(id string) {
	r.mu.Lock()
	j := r.active
	r.mu.Unlock()
	if j != nil && j.id == id {
		j.stop()
	}
}

func (r *Runner) finish(j *job) {
	r.mu.Lock()
	if r.active == j {
		r.active = nil
	}
	r.mu.Unlock()
}

func (r *Runner) run(j *job, p protocol.Power, report func(protocol.PowerState)) {
	if Decide(r.Session()) == Now {
		r.execute(p, report)
		return
	}
	if r.countdown(j, p, report) {
		r.execute(p, report)
	} else {
		report(protocol.PowerState{ID: p.ID, Phase: "cancelled"})
	}
}

// countdown shows the prompt and waits; true when the action should go ahead (Do it now, or time ran out).
// Without a prompt (it couldn't start) it still counts down, cancellable from the app.
func (r *Runner) countdown(j *job, p protocol.Power, report func(protocol.PowerState)) bool {
	every := orDefault(r.ReportEvery, 10*time.Second)
	deadline := time.Now().Add(time.Duration(p.Seconds) * time.Second)
	left := func() *int {
		n := max(0, int(time.Until(deadline).Round(time.Second)/time.Second))
		return &n
	}
	report(protocol.PowerState{ID: p.ID, Phase: "countdown", SecondsLeft: &p.Seconds})

	exited := make(chan int, 1)
	proc, err := r.Launch(p.Action, p.RequestedBy, p.Seconds)
	if err != nil {
		r.log("couldn't show the countdown prompt: " + err.Error())
	} else {
		go func() { exited <- proc.Wait() }()
	}
	wait := time.Until(deadline)
	if proc != nil {
		wait += orDefault(r.Grace, 5*time.Second) // the prompt ends itself on time; this only catches a hung one
	}
	limit := time.NewTimer(wait)
	defer limit.Stop()
	tick := time.NewTicker(every)
	defer tick.Stop()
	for {
		select {
		case code := <-exited:
			return code == 0
		case <-j.cancel:
			if proc != nil {
				proc.Kill()
			}
			return false
		case <-limit.C:
			if proc != nil {
				proc.Kill()
			}
			return true
		case <-tick.C:
			report(protocol.PowerState{ID: p.ID, Phase: "countdown", SecondsLeft: left()})
		}
	}
}

func (r *Runner) execute(p protocol.Power, report func(protocol.PowerState)) {
	report(protocol.PowerState{ID: p.ID, Phase: "executing"})
	if err := r.Exec(p.Action); err != nil {
		r.log(p.Action + " failed: " + err.Error())
	}
}

func (r *Runner) log(msg string) {
	if r.Log != nil {
		r.Log(msg)
	}
}

func orDefault(d, def time.Duration) time.Duration {
	if d > 0 {
		return d
	}
	return def
}
