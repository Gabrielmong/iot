package serverpc

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"homeagent/internal/traypipe"
)

// Source is the server PC as the tray hub sees it (trayhub.ServerPC).
type Source struct {
	Config Config
	Server string // the agent's server URL, probed at /api/identity
}

var probeHTTP = &http.Client{Timeout: 3 * time.Second}

func (s *Source) deployer() (*Deployer, error) {
	raw, err := os.ReadFile(s.Config.TokenFile()) // read each time: the deployer may rotate it on reinstall
	if err != nil {
		return nil, err
	}
	token := strings.TrimSpace(string(raw))
	if token == "" {
		return nil, errors.New("the deployer's token file is empty")
	}
	return &Deployer{URL: s.Config.URL(), Token: token}, nil
}

// Read looks at the service, the app and the deployer.
func (s *Source) Read(ctx context.Context) traypipe.ServerState {
	r := Reading{ServiceRunning: ServiceRunning(s.Config.ServiceName), ProbeOK: s.probe(ctx)}
	if d, err := s.deployer(); err != nil {
		r.StatusErr = err
	} else {
		r.Status, r.StatusErr = d.Status(ctx)
	}
	state, label, sha := Derive(r)
	return traypipe.ServerState{State: string(state), Label: label, Sha: sha}
}

func (s *Source) probe(ctx context.Context) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(s.Server, "/")+"/api/identity", nil)
	if err != nil {
		return false
	}
	res, err := probeHTTP.Do(req)
	if err != nil {
		return false
	}
	res.Body.Close()
	return res.StatusCode == http.StatusOK
}

// Command sends restartApp or deployNow.
func (s *Source) Command(ctx context.Context, typ, by string) error {
	d, err := s.deployer()
	if err != nil {
		return errors.New("can't reach the deployer: " + err.Error())
	}
	return d.Command(ctx, typ, by)
}
