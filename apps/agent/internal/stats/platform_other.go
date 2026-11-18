//go:build !windows

package stats

import (
	"os/exec"

	"homeagent/internal/protocol"
)

// The agent only runs on Windows; these keep the portable code building (and testable) elsewhere.

func fixedDisks() []protocol.Disk      { return nil }
func activeSession() (*string, *int64) { return nil, nil }
func hideWindow(*exec.Cmd)             {}
func trustedNvidiaSmi() string         { return "" }
