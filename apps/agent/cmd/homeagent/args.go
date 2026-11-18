package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"strconv"
)

type mode int

const (
	modeInstall      mode = iota // double-clicked download: install and start the service
	modeService                  // run by the Service Control Manager
	modePrompt                   // the countdown dialog, run in the signed-in user's session
	modeUninstall                // remove the agent from this PC (admin)
	modeUpdateHelper             // swaps in a downloaded build, then restarts the service
)

type invocation struct {
	mode     mode
	action   string
	by       string
	seconds  int
	from, to string
}

var promptActions = map[string]bool{"sleep": true, "shutdown": true, "restart": true}

// parseArgs maps the command line (without the program name) to what to do; anything unknown is an error.
func parseArgs(args []string) (invocation, error) {
	if len(args) == 0 {
		return invocation{mode: modeInstall}, nil
	}
	fs := flag.NewFlagSet(args[0], flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	var inv invocation
	switch args[0] {
	case "service":
		inv.mode = modeService
	case "uninstall":
		inv.mode = modeUninstall
	case "prompt":
		inv.mode = modePrompt
		fs.StringVar(&inv.action, "action", "", "")
		fs.StringVar(&inv.by, "by", "", "")
		fs.IntVar(&inv.seconds, "seconds", 60, "")
	case "update-helper":
		inv.mode = modeUpdateHelper
		fs.StringVar(&inv.from, "from", "", "")
		fs.StringVar(&inv.to, "to", "", "")
	default:
		return invocation{}, fmt.Errorf("unknown mode %q", args[0])
	}
	if err := fs.Parse(args[1:]); err != nil {
		return invocation{}, err
	}
	if fs.NArg() > 0 {
		return invocation{}, errors.New("unexpected arguments")
	}
	switch inv.mode {
	case modePrompt:
		if !promptActions[inv.action] || inv.seconds < 0 || inv.seconds > 3600 {
			return invocation{}, errors.New("bad prompt arguments")
		}
	case modeUpdateHelper:
		if inv.from == "" || inv.to == "" {
			return invocation{}, errors.New("update-helper needs --from and --to")
		}
	}
	return inv, nil
}

// agentVersion parses the build's version (set with -ldflags "-X main.version=N"); 0 for a dev build.
func agentVersion(s string) int {
	n, err := strconv.Atoi(s)
	if err != nil || n < 0 {
		return 0
	}
	return n
}
