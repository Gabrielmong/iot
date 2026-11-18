package client

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"homeagent/internal/protocol"
)

var info = protocol.Hello{Version: 1004, Hostname: "GANDALF", IPs: []string{"192.168.0.20"}, MACs: []string{"aa:aa:aa:aa:aa:01"}, WakeMAC: "aa:aa:aa:aa:aa:01", OS: "Windows 11 Pro"}

func TestEnrollPostsTheDocumentedBody(t *testing.T) {
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/agent/enroll" {
			t.Errorf("%s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		_, _ = w.Write([]byte(`{"deviceId":"dev-1","token":"tok"}`))
	}))
	defer srv.Close()
	id, token, err := Enroll(context.Background(), srv.URL, "code-1", info)
	if err != nil || id != "dev-1" || token != "tok" {
		t.Fatalf("got %s %s %v", id, token, err)
	}
	want := map[string]any{"code": "code-1", "hostname": "GANDALF", "macs": []any{"aa:aa:aa:aa:aa:01"}, "wakeMac": "aa:aa:aa:aa:aa:01", "ips": []any{"192.168.0.20"}, "os": "Windows 11 Pro", "agentVersion": 1004.0}
	if !reflect.DeepEqual(body, want) {
		t.Fatalf("body %v", body)
	}
}

func TestEnrollUsedCodeIsErrCodeGone(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusGone) }))
	defer srv.Close()
	if _, _, err := Enroll(context.Background(), srv.URL, "used", info); !errors.Is(err, ErrCodeGone) {
		t.Fatalf("got %v", err)
	}
}

func TestEnrollOtherFailuresAreErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusBadRequest) }))
	defer srv.Close()
	if _, _, err := Enroll(context.Background(), srv.URL, "x", info); err == nil || errors.Is(err, ErrCodeGone) {
		t.Fatalf("got %v", err)
	}
}
