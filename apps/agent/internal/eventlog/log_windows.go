// Package eventlog writes the agent's messages to the Windows event log (Application, source HomeAgent).
package eventlog

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"golang.org/x/sys/windows/svc/eventlog"

	"homeagent/internal/paths"
)

// Log is the agent's logger (client.Logger and friends); without a registered source it writes to stderr.
type Log struct{ el *eventlog.Log }

// Open returns the event log writer.
func Open() *Log {
	el, err := eventlog.Open(paths.ServiceName)
	if err != nil {
		return &Log{}
	}
	return &Log{el: el}
}

func (l *Log) Info(msg string) {
	if l.el == nil || l.el.Info(1, msg) != nil {
		fmt.Fprintln(os.Stderr, msg)
	}
}

func (l *Log) Error(msg string) {
	if l.el == nil || l.el.Error(2, msg) != nil {
		fmt.Fprintln(os.Stderr, "error:", msg)
	}
}

// Register makes HomeAgent an event log source (install); already registered is fine.
func Register() error {
	err := eventlog.InstallAsEventCreate(paths.ServiceName, eventlog.Error|eventlog.Warning|eventlog.Info)
	if err != nil && strings.Contains(err.Error(), "registry key already exists") {
		return nil
	}
	return err
}

// Unregister removes the source (uninstall).
func Unregister() error {
	err := eventlog.Remove(paths.ServiceName)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
