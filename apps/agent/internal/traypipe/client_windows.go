package traypipe

import (
	"bufio"
	"context"
	"errors"
	"io"
	"os"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	dialFor   = 10 * time.Second
	dialEvery = 250 * time.Millisecond
)

// Conn is the tray's end of the pipe.
type Conn struct {
	f   *os.File
	sc  *bufio.Scanner
	wmu sync.Mutex
}

// Dial opens the service's pipe, retrying for 10 s (the service may still be starting).
func Dial(ctx context.Context) (*Conn, error) {
	return dialName(ctx, PipeName, serverIsService)
}

var procServerSession = windows.NewLazySystemDLL("kernel32.dll").NewProc("GetNamedPipeServerSessionId")

// serverIsService refuses a pipe served from outside session 0 (where only services run; a signed-in user
// can't start a process there), so a program that grabbed the name first can't feed the tray links or
// statuses. A user process couldn't check the service's token itself: SYSTEM's token isn't open to users.
func serverIsService(h windows.Handle) error {
	var session uint32
	if r, _, err := procServerSession.Call(uintptr(h), uintptr(unsafe.Pointer(&session))); r == 0 {
		return err
	}
	if session != 0 {
		return errNotService
	}
	return nil
}

var errNotService = errors.New("the tray pipe isn't the HomeAgent service's")

func dialName(ctx context.Context, name string, verify func(windows.Handle) error) (*Conn, error) {
	deadline := time.Now().Add(dialFor)
	for {
		h, err := windows.CreateFile(windows.StringToUTF16Ptr(name),
			clientAccess, 0, nil, windows.OPEN_EXISTING,
			windows.FILE_FLAG_OVERLAPPED|windows.SECURITY_SQOS_PRESENT|windows.SECURITY_IDENTIFICATION, 0)
		if err == nil {
			if err := verify(h); err != nil {
				windows.CloseHandle(h)
				return nil, err
			}
			f := os.NewFile(uintptr(h), PipeName)
			sc := bufio.NewScanner(f)
			sc.Buffer(make([]byte, 4096), MaxLine)
			return &Conn{f: f, sc: sc}, nil
		}
		if time.Now().After(deadline) {
			return nil, err
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(dialEvery):
		}
	}
}

// Send writes one request.
func (c *Conn) Send(r Request) error {
	c.wmu.Lock()
	defer c.wmu.Unlock()
	_, err := c.f.Write(EncodeRequest(r))
	return err
}

// Read waits for the next reply; io.EOF once the service has gone away.
func (c *Conn) Read() (Reply, error) {
	for c.sc.Scan() {
		r, err := DecodeReply(c.sc.Bytes())
		if errors.Is(err, ErrUnknown) {
			continue // a newer service; skip what this tray doesn't know
		}
		return r, err
	}
	if err := c.sc.Err(); err != nil {
		return Reply{}, err
	}
	return Reply{}, io.EOF
}

// Close hangs up.
func (c *Conn) Close() error { return c.f.Close() }
