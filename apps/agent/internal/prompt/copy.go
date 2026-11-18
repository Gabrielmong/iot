// Package prompt is the countdown dialog shown to the person at the PC (run as `HomeAgent.exe prompt ...` in
// their session). Exit code 0 = go ahead (Do it now, or time ran out), 1 = cancelled.
package prompt

import "fmt"

var phrases = map[string]string{
	"restart":  "is restarting this PC",
	"sleep":    "is putting this PC to sleep",
	"shutdown": "is shutting down this PC",
}

// Text is the dialog's line with n seconds left, e.g. "Ann is restarting this PC in 60 s".
func Text(action, by string, n int) string {
	phrase, ok := phrases[action]
	if !ok {
		phrase = "is turning off this PC"
	}
	return fmt.Sprintf("%s %s in %d s", by, phrase, n)
}

// Exit codes of the prompt process.
const (
	GoAhead   = 0
	Cancelled = 1
)
