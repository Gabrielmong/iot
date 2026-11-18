package trays

import (
	"errors"
	"os/exec"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

type quietLog struct{}

func (quietLog) Info(string)  {}
func (quietLog) Error(string) {}

// start runs name args and returns a handle the manager may wait on and terminate.
func start(t *testing.T, name string, args ...string) (*exec.Cmd, windows.Handle) {
	t.Helper()
	cmd := exec.Command(name, args...)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	h, err := windows.OpenProcess(windows.SYNCHRONIZE|windows.PROCESS_TERMINATE|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(cmd.Process.Pid))
	if err != nil {
		t.Fatal(err)
	}
	return cmd, h
}

func exitCode(t *testing.T, cmd *exec.Cmd) int {
	t.Helper()
	var e *exec.ExitError
	if err := cmd.Wait(); errors.As(err, &e) {
		return e.ExitCode()
	} else if err != nil {
		t.Fatal(err)
	}
	return 0
}

// A tray removes its icon when the pipe closes; killing it first leaves a ghost icon.
func TestStopAllLetsTraysLeaveOnTheirOwnFirst(t *testing.T) {
	var polite, stuck *exec.Cmd
	m := &Manager{
		Policy:   &Policy{Now: time.Now},
		Sessions: func() []uint32 { return []uint32{1, 2} },
		Log:      quietLog{},
		Launch: func(s uint32) (windows.Handle, error) {
			var h windows.Handle
			if s == 1 {
				polite, h = start(t, "cmd", "/c", "ping -n 2 127.0.0.1 >nul & exit /b 7") // leaves after ~1 s
			} else {
				stuck, h = start(t, "ping", "-n", "60", "127.0.0.1")
			}
			return h, nil
		},
	}
	m.Sync()
	began := time.Now()
	m.StopAll(3 * time.Second)
	took := time.Since(began)

	if c := exitCode(t, polite); c != 7 {
		t.Fatalf("the tray that was leaving was killed (exit %d)", c)
	}
	if c := exitCode(t, stuck); c != stopKilled {
		t.Fatalf("the stuck tray exited %d, want it killed (%d)", c, stopKilled)
	}
	if took > 5*time.Second {
		t.Fatalf("StopAll took %v, want about the 3 s grace", took)
	}
}

func TestNothingIsRelaunchedOnceStopping(t *testing.T) {
	launches := 0
	m := &Manager{
		Policy:   &Policy{Now: time.Now},
		Sessions: func() []uint32 { return []uint32{1} },
		Log:      quietLog{},
		Launch: func(uint32) (windows.Handle, error) {
			launches++
			_, h := start(t, "cmd", "/c", "exit /b 0")
			return h, nil
		},
	}
	m.Sync()
	m.StopAll(2 * time.Second)
	time.Sleep(300 * time.Millisecond) // watch's Sync after the exit
	if launches != 1 {
		t.Fatalf("launched %d trays, want 1 (none while stopping)", launches)
	}
}
