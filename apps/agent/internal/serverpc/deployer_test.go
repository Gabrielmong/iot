package serverpc

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestStatusSendsTokenAndMapsFields(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/status" || r.Header.Get("Authorization") != "Bearer t" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"running":{"sha":"94c48fc1","message":"m"},"busy":"Deploying abc1234","autoDeploy":true}`))
	}))
	defer srv.Close()
	d := &Deployer{URL: srv.URL, Token: "t"}
	got, err := d.Status(context.Background())
	if err != nil || got != (DeployerStatus{RunningSha: "94c48fc1", Busy: "Deploying abc1234"}) {
		t.Fatalf("got %+v %v", got, err)
	}
}

func TestCommandPostsTypeAndBy(t *testing.T) {
	var body map[string]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/commands" || r.Header.Get("Authorization") != "Bearer t" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()
	d := &Deployer{URL: srv.URL, Token: "t"}
	if err := d.Command(context.Background(), "deployNow", "Gabriel on EPKG4 (tray)"); err != nil {
		t.Fatal(err)
	}
	if body["type"] != "deployNow" || body["by"] != "Gabriel on EPKG4 (tray)" {
		t.Fatalf("body %v", body)
	}
}

func TestCommandReturnsTheDeployersError(t *testing.T) {
	cases := map[int]string{
		http.StatusConflict:     "Busy: Deploying abc1234",
		http.StatusUnauthorized: "Unauthorized",
	}
	for status, msg := range cases {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
		}))
		d := &Deployer{URL: srv.URL, Token: "t"}
		err := d.Command(context.Background(), "restartApp", "x")
		srv.Close()
		if err == nil || err.Error() != msg {
			t.Errorf("%d: got %v", status, err)
		}
	}
}

func TestStatusErrorsOnNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(500) }))
	defer srv.Close()
	if _, err := (&Deployer{URL: srv.URL, Token: "t"}).Status(context.Background()); err == nil {
		t.Fatal("no error")
	}
}
