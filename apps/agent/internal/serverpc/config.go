// Package serverpc is what the agent knows about the Home server when it runs on the server PC: where the
// deployer's local API is, how to ask it for status and commands, and how to sum the server's state up.
package serverpc

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// Config is the part of the deployer's deployer.json the agent needs.
type Config struct {
	Root        string
	APIPort     int
	ServiceName string
}

// The deployer's own defaults (apps/deployer/src/config.ts).
const (
	defaultAPIPort     = 4100
	defaultServiceName = "HomeControl"
	DefaultRoot        = `C:\HomeControl`
)

// ConfigPathFromParams takes the HomeDeployer NSSM AppParameters ("<main.js> <deployer.json>") and returns
// the deployer.json path.
func ConfigPathFromParams(appParameters string) (string, bool) {
	fields := strings.Fields(appParameters)
	if len(fields) < 2 {
		return "", false
	}
	return fields[1], true
}

// ParseConfig reads deployer.json; root is required, the rest default like the deployer does.
func ParseConfig(raw []byte) (Config, error) {
	var f struct {
		Root        string `json:"root"`
		APIPort     int    `json:"apiPort"`
		ServiceName string `json:"serviceName"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		return Config{}, fmt.Errorf("deployer.json: %w", err)
	}
	if f.Root == "" {
		return Config{}, errors.New("deployer.json has no root")
	}
	c := Config{Root: f.Root, APIPort: f.APIPort, ServiceName: f.ServiceName}
	if c.APIPort == 0 {
		c.APIPort = defaultAPIPort
	}
	if c.ServiceName == "" {
		c.ServiceName = defaultServiceName
	}
	return c, nil
}

// Fallback is the config when deployer.json can't be read.
func Fallback() Config {
	return Config{Root: DefaultRoot, APIPort: defaultAPIPort, ServiceName: defaultServiceName}
}

// TokenFile is the deployer API's bearer token (readable by SYSTEM).
func (c Config) TokenFile() string { return strings.TrimRight(c.Root, `\`) + `\deployer\api-token` }

// URL is the deployer API, which listens on loopback only.
func (c Config) URL() string { return fmt.Sprintf("http://127.0.0.1:%d", c.APIPort) }
