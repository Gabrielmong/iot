package power

import (
	"errors"
	"strconv"

	"golang.org/x/sys/windows"

	"homeagent/internal/winsession"
)

// CurrentSession reports the session someone is using (console, else Remote Desktop) for Decide.
func CurrentSession() Session {
	c := winsession.Active()
	return Session{SignedIn: c.ID != winsession.NoSession && c.User != "", Locked: c.Locked}
}

// Launch runs `HomeAgent.exe prompt --action <a> --by <name> --seconds <n>` on the desktop of the user who is
// using the PC (at the console or over Remote Desktop), as them.
// Only the service (LocalSystem) can do this: WTSQueryUserToken needs SE_TCB_NAME.
func Launch(action, requestedBy string, seconds int) (Process, error) {
	session := winsession.UserSession()
	if session == winsession.NoSession {
		return nil, errors.New("nobody is using the PC")
	}
	h, err := winsession.LaunchAs(session, []string{"prompt", "--action", action, "--by", requestedBy, "--seconds", strconv.Itoa(seconds)})
	if err != nil {
		return nil, err
	}
	return &winProcess{h: h}, nil
}

type winProcess struct{ h windows.Handle }

// Wait returns the prompt's exit code (and releases the process handle).
func (p *winProcess) Wait() int {
	defer windows.CloseHandle(p.h)
	if _, err := windows.WaitForSingleObject(p.h, windows.INFINITE); err != nil {
		return 1
	}
	var code uint32
	if windows.GetExitCodeProcess(p.h, &code) != nil {
		return 1
	}
	return int(code)
}

// Kill closes the prompt (counts as cancelled).
func (p *winProcess) Kill() { _ = windows.TerminateProcess(p.h, 1) }
