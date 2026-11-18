// Package tray is what the tray icon shows for a status: the menu, the tooltip, the icon state, the links,
// and the notifications when a deploy or restart started from the tray ends. No Windows code here.
package tray

import (
	"fmt"
	"net/url"
	"strings"

	"homeagent/internal/traypipe"
)

// ItemID identifies a menu item (also its Win32 command id; 0 is reserved).
type ItemID int

const (
	IDStatus ItemID = iota + 1
	IDServerStatus
	IDOpenHome
	IDOpenDeploys
	IDRestart
	IDDeploy
	IDOpenPC
	IDCheck
	IDHide
)

// Item is one menu row; a Separator has no ID or label.
type Item struct {
	ID        ItemID
	Label     string
	Disabled  bool
	Separator bool
}

var separator = Item{Separator: true}

// Menu is the right-click menu for s.
func Menu(s traypipe.Status) []Item {
	agentStatus := Item{ID: IDStatus, Label: agentLine(s), Disabled: true}
	openPC := Item{ID: IDOpenPC, Label: "Open this PC in Home"}
	check := Item{ID: IDCheck, Label: "Check for updates"}
	hide := Item{ID: IDHide, Label: "Hide until next sign-in"}
	if s.ServerPC == nil {
		return []Item{agentStatus, separator, {ID: IDOpenHome, Label: "Open Home"}, openPC, separator, check, separator, hide}
	}
	busy := s.ServerPC.State == "busy"
	return []Item{
		{ID: IDServerStatus, Label: "Server · " + serverWords(*s.ServerPC), Disabled: true},
		{ID: IDOpenHome, Label: "Open Home"},
		{ID: IDOpenDeploys, Label: "Open Deploys page"},
		{ID: IDRestart, Label: "Restart server…", Disabled: busy},
		{ID: IDDeploy, Label: "Deploy latest now…", Disabled: busy},
		separator,
		agentStatus, openPC, check,
		separator,
		hide,
	}
}

func agentLine(s traypipe.Status) string {
	if s.Connected {
		return fmt.Sprintf("HomeAgent %d · Connected", s.Version)
	}
	return fmt.Sprintf("HomeAgent %d · Not connected — retrying", s.Version)
}

// serverWords is the server's state as the menu says it ("Running 94c48fc", "Stopped"…).
func serverWords(st traypipe.ServerState) string {
	switch st.State {
	case "running":
		if st.Sha == "" {
			return "Running"
		}
		return "Running " + short(st.Sha)
	case "busy":
		return st.Label
	case "not-responding":
		return "Not responding"
	case "stopped":
		return "Stopped"
	case "deployer-down":
		return "Deployer not responding"
	default:
		return "Unknown"
	}
}

func short(sha string) string {
	if len(sha) > 7 {
		return sha[:7]
	}
	return sha
}

// Tooltip is the text shown when hovering the icon.
func Tooltip(s traypipe.Status) string {
	t := "Home — not connected"
	if s.Connected {
		t = "Home — connected"
	}
	if s.ServerPC != nil {
		words := serverWords(*s.ServerPC)
		if s.ServerPC.State == "running" {
			words = "Running"
		}
		t += " · server " + strings.ToLower(words)
	}
	return t
}

// Dimmed: show the greyed icon (not connected, or the server isn't running).
func Dimmed(s traypipe.Status) bool {
	return !s.Connected || (s.ServerPC != nil && s.ServerPC.State != "running")
}

// Target is the page an Open item (or a left-click, IDOpenHome) opens; "" for other items, and for a server
// that isn't an http(s) address (ShellExecute would run anything else).
func Target(s traypipe.Status, id ItemID) string {
	u, err := url.Parse(s.Server)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return ""
	}
	base := strings.TrimRight(s.Server, "/")
	switch id {
	case IDOpenHome:
		return base + "/"
	case IDOpenPC:
		return base + "/devices/" + url.PathEscape(s.DeviceID)
	case IDOpenDeploys:
		return base + "/admin/deploys"
	default:
		return ""
	}
}
