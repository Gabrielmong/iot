package client

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"homeagent/internal/protocol"
)

// ErrCodeGone: the enrollment code is unknown, already used or expired (HTTP 410).
var ErrCodeGone = errors.New("this download's pairing code was already used or has expired; download the agent again from the app")

type enrollBody struct {
	Code         string   `json:"code"`
	Hostname     string   `json:"hostname"`
	MACs         []string `json:"macs"`
	WakeMAC      string   `json:"wakeMac"`
	IPs          []string `json:"ips"`
	OS           string   `json:"os"`
	AgentVersion int      `json:"agentVersion"`
}

// Enroll redeems a one-time code for this PC's device id and agent token.
func Enroll(ctx context.Context, server, code string, info protocol.Hello) (deviceID, token string, err error) {
	body, _ := json.Marshal(enrollBody{Code: code, Hostname: info.Hostname, MACs: info.MACs, WakeMAC: info.WakeMAC, IPs: info.IPs, OS: info.OS, AgentVersion: info.Version})
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(server, "/")+"/agent/enroll", bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer res.Body.Close()
	switch res.StatusCode {
	case http.StatusOK:
	case http.StatusGone:
		return "", "", ErrCodeGone
	default:
		return "", "", fmt.Errorf("enrollment failed: HTTP %d", res.StatusCode)
	}
	var out struct {
		DeviceID string `json:"deviceId"`
		Token    string `json:"token"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil || out.DeviceID == "" || out.Token == "" {
		return "", "", fmt.Errorf("enrollment failed: bad reply")
	}
	return out.DeviceID, out.Token, nil
}
