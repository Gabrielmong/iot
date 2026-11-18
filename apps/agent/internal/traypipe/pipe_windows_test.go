package traypipe

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

type echoHub struct{ statuses chan Status }

func (e *echoHub) Subscribe() (<-chan Status, func()) { return e.statuses, func() {} }
func (e *echoHub) Handle(_ context.Context, session uint32, by string, r Request) Reply {
	return Reply{T: Result, ID: r.ID, OK: true, Message: fmt.Sprintf("%s %s", r.T, by)}
}

type nolog struct{}

func (nolog) Info(string)  {}
func (nolog) Error(string) {}

func testPipe(t *testing.T) string {
	return fmt.Sprintf(`\\.\pipe\HomeAgent.tray.test.%d.%d`, os.Getpid(), time.Now().UnixNano())
}

func startServer(t *testing.T, name string, hub Handler) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go func() { _ = serveOn(ctx, name, hub, func(uint32) string { return "me" }, nolog{}) }()
}

func TestRoundTripOverARealPipe(t *testing.T) {
	name := testPipe(t)
	hub := &echoHub{statuses: make(chan Status, 1)}
	hub.statuses <- Status{Version: 14}
	startServer(t, name, hub)
	c, err := dialName(context.Background(), name, func(windows.Handle) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	if r, err := c.Read(); err != nil || r.T != StatusReply || r.Status.Version != 14 {
		t.Fatalf("status %+v %v", r, err)
	}
	if err := c.Send(Request{T: UpdateCheck, ID: "1"}); err != nil {
		t.Fatal(err)
	}
	if r, err := c.Read(); err != nil || r.Message != "update.check me" || r.ID != "1" {
		t.Fatalf("result %+v %v", r, err)
	}
}

func TestUsersCantAddTheirOwnPipeInstance(t *testing.T) {
	name := testPipe(t)
	startServer(t, name, &echoHub{statuses: make(chan Status)})
	time.Sleep(100 * time.Millisecond)
	h, err := windows.CreateNamedPipe(windows.StringToUTF16Ptr(name), windows.PIPE_ACCESS_DUPLEX,
		windows.PIPE_TYPE_BYTE, pipeUnlimitedInstances, bufSize, bufSize, 0, nil)
	if err == nil {
		windows.CloseHandle(h)
		t.Fatal("a second instance was created by a non-SYSTEM process")
	}
	if !errors.Is(err, windows.ERROR_ACCESS_DENIED) {
		t.Fatalf("got %v", err)
	}
}

func TestTheTrayOnlyTrustsTheService(t *testing.T) {
	name := testPipe(t)
	startServer(t, name, &echoHub{statuses: make(chan Status)}) // this test runs in a user session, not session 0
	_, err := dialName(context.Background(), name, serverIsService)
	if err == nil || !strings.Contains(err.Error(), "isn't the HomeAgent service") {
		t.Fatalf("got %v", err)
	}
}
