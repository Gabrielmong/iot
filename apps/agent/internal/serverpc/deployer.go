package serverpc

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Deployer talks to the deployer's local API (apps/deployer/src/api.ts).
type Deployer struct {
	URL, Token string
	HTTP       *http.Client // nil: a client with a 5 s timeout
}

// DeployerStatus is what the tray needs from GET /status.
type DeployerStatus struct {
	RunningSha string
	Busy       string // e.g. "Deploying abc1234"; empty when idle
}

var defaultHTTP = &http.Client{Timeout: 5 * time.Second}

func (d *Deployer) client() *http.Client {
	if d.HTTP != nil {
		return d.HTTP
	}
	return defaultHTTP
}

func (d *Deployer) do(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, d.URL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+d.Token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return d.client().Do(req)
}

// Status reads the running release and whether an operation is in progress.
func (d *Deployer) Status(ctx context.Context) (DeployerStatus, error) {
	res, err := d.do(ctx, http.MethodGet, "/status", nil)
	if err != nil {
		return DeployerStatus{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return DeployerStatus{}, errorFrom(res)
	}
	var body struct {
		Running *struct {
			Sha string `json:"sha"`
		} `json:"running"`
		Busy string `json:"busy"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&body); err != nil {
		return DeployerStatus{}, err
	}
	st := DeployerStatus{Busy: body.Busy}
	if body.Running != nil {
		st.RunningSha = body.Running.Sha
	}
	return st, nil
}

// Command sends restartApp or deployNow; a refusal comes back as the deployer's own message.
func (d *Deployer) Command(ctx context.Context, typ, by string) error {
	payload, _ := json.Marshal(map[string]string{"type": typ, "by": by})
	res, err := d.do(ctx, http.MethodPost, "/commands", payload)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		return errorFrom(res)
	}
	return nil
}

func errorFrom(res *http.Response) error {
	var body struct {
		Error string `json:"error"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&body) == nil && body.Error != "" {
		return errors.New(body.Error)
	}
	return fmt.Errorf("deployer answered %d", res.StatusCode)
}
