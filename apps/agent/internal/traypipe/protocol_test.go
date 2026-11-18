package traypipe

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestRequestsRoundTrip(t *testing.T) {
	for _, r := range []Request{
		{T: StatusGet}, {T: UpdateCheck, ID: "1"}, {T: ServerRestart, ID: "2"}, {T: ServerDeploy, ID: "3"}, {T: TrayHide},
	} {
		line := EncodeRequest(r)
		if !strings.HasSuffix(string(line), "}\n") || strings.Count(string(line), "\n") != 1 {
			t.Fatalf("line %q", line)
		}
		got, err := DecodeRequest(line)
		if err != nil || got != r {
			t.Errorf("%+v: got %+v %v", r, got, err)
		}
	}
}

func TestRepliesRoundTrip(t *testing.T) {
	status := Status{Version: 14, Connected: true, Server: "http://192.168.0.100:4000", DeviceID: "dev1",
		ServerPC: &ServerState{State: "running", Sha: "94c48fc1"}}
	for _, r := range []Reply{
		{T: StatusReply, Status: &status},
		{T: Result, ID: "1", OK: true, Message: "Up to date (version 14)"},
		{T: Result, ID: "2", Message: "Busy: Deploying abc1234"},
	} {
		got, err := DecodeReply(EncodeReply(r))
		if err != nil || !reflect.DeepEqual(got, r) {
			t.Errorf("%+v: got %+v %v", r, got, err)
		}
	}
}

func TestEncodeCarriesVersion(t *testing.T) {
	if got := string(EncodeRequest(Request{T: StatusGet})); got != "{\"v\":1,\"t\":\"status.get\"}\n" {
		t.Fatalf("got %q", got)
	}
}

func TestDecodeRejectsOtherVersionsAndUnknownTypes(t *testing.T) {
	if _, err := DecodeRequest([]byte(`{"v":2,"t":"status.get"}`)); err == nil {
		t.Error("v2 accepted")
	}
	if _, err := DecodeRequest([]byte(`{"v":1,"t":"exec"}`)); !errors.Is(err, ErrUnknown) {
		t.Errorf("exec: %v", err)
	}
	if _, err := DecodeRequest([]byte(`nope`)); err == nil {
		t.Error("bad json accepted")
	}
	if _, err := DecodeReply([]byte(`{"v":1,"t":"run"}`)); !errors.Is(err, ErrUnknown) {
		t.Errorf("reply run: %v", err)
	}
}
