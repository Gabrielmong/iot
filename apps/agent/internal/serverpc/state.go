package serverpc

// State sums the server up for the tray.
type State string

const (
	Running       State = "running"
	Busy          State = "busy" // the deployer is deploying, restarting or rolling back
	NotResponding State = "not-responding"
	Stopped       State = "stopped"
	DeployerDown  State = "deployer-down"
)

// Reading is one look at the server: the Service Control Manager, an /api/identity probe, the deployer.
type Reading struct {
	ServiceRunning bool
	ProbeOK        bool
	Status         DeployerStatus
	StatusErr      error
}

// Derive gives the state, the deployer's busy label (busy only) and the running sha (when known).
func Derive(r Reading) (state State, label, sha string) {
	sha = r.Status.RunningSha
	switch {
	case r.StatusErr == nil && r.Status.Busy != "":
		return Busy, r.Status.Busy, sha
	case !r.ServiceRunning:
		return Stopped, "", sha
	case !r.ProbeOK:
		return NotResponding, "", sha
	case r.StatusErr != nil:
		return DeployerDown, "", sha
	default:
		return Running, "", sha
	}
}
