// Package power carries out sleep, shut down and restart requests, behind a countdown prompt when someone is at the PC.
package power

// Session is the console session as far as a power action cares.
type Session struct {
	SignedIn bool
	Locked   bool
}

// Mode is how a request is carried out.
type Mode int

const (
	// Prompt: someone is signed in and unlocked, so they get a countdown they can cancel.
	Prompt Mode = iota
	// Now: nobody would see a prompt (nobody signed in, or the session is locked).
	Now
)

func (m Mode) String() string {
	if m == Now {
		return "now"
	}
	return "prompt"
}

// Decide picks the mode for the current session.
func Decide(s Session) Mode {
	if !s.SignedIn || s.Locked {
		return Now
	}
	return Prompt
}
