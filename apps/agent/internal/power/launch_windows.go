package power

import (
	"errors"
	"os"
	"strconv"
	"unsafe"

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
	var token windows.Token
	if err := windows.WTSQueryUserToken(session, &token); err != nil {
		return nil, err
	}
	defer token.Close()
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	args := []string{exe, "prompt", "--action", action, "--by", requestedBy, "--seconds", strconv.Itoa(seconds)}
	cmdline := windows.ComposeCommandLine(args)
	var env *uint16
	var block *uint16
	if windows.CreateEnvironmentBlock(&block, token, false) == nil {
		env = block
		defer windows.DestroyEnvironmentBlock(block)
	}
	si := windows.StartupInfo{Desktop: windows.StringToUTF16Ptr(`winsta0\default`)}
	si.Cb = uint32(unsafe.Sizeof(si))
	var pi windows.ProcessInformation
	err = windows.CreateProcessAsUser(token, windows.StringToUTF16Ptr(exe), windows.StringToUTF16Ptr(cmdline),
		nil, nil, false, windows.CREATE_UNICODE_ENVIRONMENT, env, nil, &si, &pi)
	if err != nil {
		return nil, err
	}
	windows.CloseHandle(pi.Thread)
	return &winProcess{h: pi.Process}, nil
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
