package update

import (
	"io"
	"os"
	"os/exec"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
)

// Swap starts the downloaded build as `update-helper --from <new> --to <installed>`, detached: it outlives the
// service it is about to stop.
func Swap(newExe, installedExe string) error {
	cmd := exec.Command(newExe, "update-helper", "--from", newExe, "--to", installedExe)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: windows.CREATE_NO_WINDOW | windows.CREATE_NEW_PROCESS_GROUP | windows.DETACHED_PROCESS,
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

// Helper is the update-helper mode: stop the service, copy the new build over the installed one, start it again.
// It copies (not renames) because it runs from the new file. The service is restarted even if the copy failed.
func Helper(from, to string, stop, start func() error) error {
	if err := stop(); err != nil {
		return err
	}
	var copyErr error
	for range 20 { // the old exe may stay locked for a moment after the service stops
		if copyErr = copyFile(from, to); copyErr == nil {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if err := start(); err != nil {
		return err
	}
	return copyErr
}

func copyFile(from, to string) error {
	in, err := os.Open(from)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := to + ".tmp"
	_ = os.Remove(tmp)
	out, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o755)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, to)
}
