package main

import (
	"fmt"
	"os"

	"golang.org/x/sys/windows/svc"

	"homeagent/internal/eventlog"
	"homeagent/internal/install"
	"homeagent/internal/prompt"
	"homeagent/internal/service"
	"homeagent/internal/update"
)

// version is set at build time: -ldflags "-X main.version=N".
var version string

func main() {
	inv, err := parseArgs(os.Args[1:])
	if err != nil {
		install.Tell("HomeAgent: "+err.Error(), true)
		os.Exit(2)
	}
	switch inv.mode {
	case modeInstall:
		asAdmin("", "HomeAgent is installed. You can close this.", "HomeAgent couldn't be installed", install.Install)
	case modeUninstall:
		asAdmin("uninstall", "HomeAgent was removed from this PC.", "HomeAgent couldn't be removed", install.Manual)
	case modeService:
		if ok, _ := svc.IsWindowsService(); !ok {
			install.Tell("This mode is for the Windows service only.", true)
			os.Exit(2)
		}
		if err := service.Run(agentVersion(version)); err != nil {
			eventlog.Open().Error("service failed: " + err.Error())
			os.Exit(1)
		}
	case modePrompt:
		os.Exit(prompt.Show(inv.action, inv.by, inv.seconds))
	case modeUpdateHelper:
		if err := update.Helper(inv.from, inv.to, install.StopService, install.StartService); err != nil {
			eventlog.Open().Error("update failed: " + err.Error())
			os.Exit(1)
		}
	}
}

// asAdmin runs f elevated (relaunching through UAC when needed) and tells the person how it went.
func asAdmin(args, done, failed string, f func() error) {
	if !install.Elevated() {
		if err := install.Relaunch(args); err != nil {
			install.Tell(fmt.Sprintf("%s: %v", failed, err), true)
			os.Exit(1)
		}
		return
	}
	if err := f(); err != nil {
		install.Tell(fmt.Sprintf("%s: %v", failed, err), true)
		os.Exit(1)
	}
	install.Tell(done, false)
}
