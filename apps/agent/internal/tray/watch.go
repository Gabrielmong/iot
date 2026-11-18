package tray

import (
	"strings"

	"homeagent/internal/traypipe"
)

// Watch follows a deploy or restart started from this tray and says when it has ended.
type Watch struct {
	kind    string // "deploy" | "restart"; "" when nothing is being watched
	sawBusy bool
}

// Started: the deployer accepted a "deploy" or "restart".
func (w *Watch) Started(kind string) { *w = Watch{kind: kind} }

// Next looks at a new status: a notification (title, text) once the operation is over.
func (w *Watch) Next(s traypipe.Status) (title, text string, ok bool) {
	if w.kind == "" || s.ServerPC == nil {
		return "", "", false
	}
	if s.ServerPC.State == "busy" {
		w.sawBusy = true
		return "", "", false
	}
	if !w.sawBusy { // still the status from before the command
		return "", "", false
	}
	kind := w.kind
	*w = Watch{}
	if s.ServerPC.State == "running" {
		if kind == "restart" {
			return "Server restarted", "Running " + short(s.ServerPC.Sha), true
		}
		return "Deploy finished", "Running " + short(s.ServerPC.Sha), true
	}
	title = "Deploy ended"
	if kind == "restart" {
		title = "Restart ended"
	}
	return title, "The server is " + strings.ToLower(serverWords(*s.ServerPC)) + " — see the Deploys page", true
}
