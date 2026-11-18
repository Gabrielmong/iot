package winsession

// noSession is the id Windows uses for "no session" (0xFFFFFFFF).
const noSession uint32 = 0xFFFFFFFF

// NoSession is Console.ID when nobody is using the PC.
const NoSession = noSession

// candidate is one Windows session as pick sees it.
type candidate struct {
	ID     uint32
	Active bool   // WTSActive: someone is connected to it (at the console or over Remote Desktop)
	User   string // "" when nobody is signed in
}

// pick is the session someone is using: the console when someone is signed in there, else the first
// active session with a user (Remote Desktop, which leaves the console at the sign-in screen).
// NoSession when nobody is; a disconnected session can't see a prompt, so it doesn't count.
func pick(console uint32, sessions []candidate) uint32 {
	for _, s := range sessions {
		if s.ID == console && s.User != "" {
			return console
		}
	}
	for _, s := range sessions {
		if s.Active && s.User != "" {
			return s.ID
		}
	}
	return noSession
}
