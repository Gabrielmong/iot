package serverpc

import (
	"errors"
	"testing"
)

func TestDerive(t *testing.T) {
	st := DeployerStatus{RunningSha: "94c48fc1"}
	busy := DeployerStatus{RunningSha: "94c48fc1", Busy: "Deploying abc1234"}
	down := errors.New("refused")
	cases := []struct {
		name  string
		in    Reading
		state State
		label string
	}{
		{"busy wins", Reading{ServiceRunning: true, ProbeOK: true, Status: busy}, Busy, "Deploying abc1234"},
		{"running", Reading{ServiceRunning: true, ProbeOK: true, Status: st}, Running, ""},
		{"probe fails", Reading{ServiceRunning: true, Status: st}, NotResponding, ""},
		{"stopped", Reading{Status: st}, Stopped, ""},
		{"deployer down", Reading{ServiceRunning: true, ProbeOK: true, StatusErr: down}, DeployerDown, ""},
		{"deployer down and stopped", Reading{StatusErr: down}, Stopped, ""},
	}
	for _, c := range cases {
		state, label, sha := Derive(c.in)
		if state != c.state || label != c.label {
			t.Errorf("%s: got %s %q", c.name, state, label)
		}
		if c.in.StatusErr == nil && sha != "94c48fc1" {
			t.Errorf("%s: sha %q", c.name, sha)
		}
	}
}
