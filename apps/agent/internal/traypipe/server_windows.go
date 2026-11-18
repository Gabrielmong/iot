package traypipe

import (
	"bufio"
	"context"
	"errors"
	"os"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

// sddl: SYSTEM full control; signed-in (interactive) users FILE_GENERIC_READ | FILE_WRITE_DATA (0x12008b), which
// leaves out FILE_APPEND_DATA: on a pipe that is FILE_CREATE_PIPE_INSTANCE, and with it a user could add their
// own instance of the service's pipe and answer trays. Nobody else, nothing inherited.
const sddl = "D:P(A;;GA;;;SY)(A;;0x12008b;;;IU)"

// clientAccess is what a tray asks for (must fit in the IU entry above).
const clientAccess = windows.FILE_GENERIC_READ | windows.FILE_WRITE_DATA

const (
	pipeRejectRemoteClients = 0x8
	pipeUnlimitedInstances  = 255
	bufSize                 = 64 << 10
)

var procGetClientSessionID = windows.NewLazySystemDLL("kernel32.dll").NewProc("GetNamedPipeClientSessionId")

// Handler answers the trays (trayhub.Hub).
type Handler interface {
	Subscribe() (<-chan Status, func())
	Handle(ctx context.Context, session uint32, by string, r Request) Reply
}

// Logger is the service's log.
type Logger interface {
	Info(msg string)
	Error(msg string)
}

// Serve accepts trays on PipeName until ctx ends. by names the person in a session for the deployer's history.
func Serve(ctx context.Context, h Handler, by func(session uint32) string, log Logger) error {
	return serveOn(ctx, PipeName, h, by, log)
}

func serveOn(ctx context.Context, name string, h Handler, by func(session uint32) string, log Logger) error {
	sd, err := windows.SecurityDescriptorFromString(sddl)
	if err != nil {
		return err
	}
	sa := &windows.SecurityAttributes{Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), SecurityDescriptor: sd}
	first := true
	for ctx.Err() == nil {
		p, err := create(name, sa, first)
		if err != nil {
			return err
		}
		first = false
		if err := connect(ctx, p); err != nil {
			windows.CloseHandle(p)
			if ctx.Err() != nil {
				return nil
			}
			log.Error("tray pipe: " + err.Error())
			continue
		}
		go serveConn(ctx, p, h, by, log)
	}
	return nil
}

func create(name string, sa *windows.SecurityAttributes, first bool) (windows.Handle, error) {
	flags := uint32(windows.PIPE_ACCESS_DUPLEX | windows.FILE_FLAG_OVERLAPPED)
	if first { // refuse to start if someone else already owns the name
		flags |= windows.FILE_FLAG_FIRST_PIPE_INSTANCE
	}
	mode := uint32(windows.PIPE_TYPE_BYTE | windows.PIPE_READMODE_BYTE | windows.PIPE_WAIT | pipeRejectRemoteClients)
	return windows.CreateNamedPipe(windows.StringToUTF16Ptr(name), flags, mode, pipeUnlimitedInstances, bufSize, bufSize, 0, sa)
}

// connect waits for a tray to open the pipe, or for ctx to end.
func connect(ctx context.Context, p windows.Handle) error {
	ev, err := windows.CreateEvent(nil, 1, 0, nil)
	if err != nil {
		return err
	}
	defer windows.CloseHandle(ev)
	ov := windows.Overlapped{HEvent: ev}
	err = windows.ConnectNamedPipe(p, &ov)
	if errors.Is(err, windows.ERROR_PIPE_CONNECTED) {
		return nil
	}
	if !errors.Is(err, windows.ERROR_IO_PENDING) {
		return err
	}
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			_ = windows.CancelIoEx(p, &ov)
		case <-done:
		}
	}()
	var n uint32
	return windows.GetOverlappedResult(p, &ov, &n, true)
}

func clientSession(p windows.Handle) (uint32, error) {
	var id uint32
	r, _, err := procGetClientSessionID.Call(uintptr(p), uintptr(unsafe.Pointer(&id)))
	if r == 0 {
		return 0, err
	}
	return id, nil
}

// serveConn pushes every status to one tray and answers its requests until it hangs up or ctx ends.
func serveConn(ctx context.Context, p windows.Handle, h Handler, by func(uint32) string, log Logger) {
	session, err := clientSession(p)
	if err != nil {
		log.Error("tray pipe: no client session: " + err.Error())
		windows.CloseHandle(p)
		return
	}
	f := os.NewFile(uintptr(p), PipeName)
	cctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() { <-cctx.Done(); _ = f.Close() }()

	var wmu sync.Mutex
	write := func(r Reply) {
		wmu.Lock()
		defer wmu.Unlock()
		_, _ = f.Write(EncodeReply(r))
	}
	statuses, unsubscribe := h.Subscribe()
	defer unsubscribe()
	go func() {
		for {
			select {
			case s := <-statuses:
				write(Reply{T: StatusReply, Status: &s})
			case <-cctx.Done():
				return
			}
		}
	}()

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 4096), MaxLine)
	for sc.Scan() {
		req, err := DecodeRequest(sc.Bytes())
		if err != nil {
			log.Error("tray pipe: ignored a message: " + err.Error())
			continue
		}
		go func() { write(h.Handle(cctx, session, by(session), req)) }() // update.check can take seconds
	}
}
