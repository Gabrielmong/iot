package trays

import (
	"reflect"
	"testing"
	"time"
)

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func newPolicy() (*Policy, *clock) {
	c := &clock{t: time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)}
	return &Policy{Now: c.now}, c
}

func TestLaunchesEverySessionWithoutATray(t *testing.T) {
	p, _ := newPolicy()
	if got := p.ToLaunch([]uint32{1, 2}, nil); !reflect.DeepEqual(got, []uint32{1, 2}) {
		t.Fatalf("got %v", got)
	}
	if got := p.ToLaunch([]uint32{1, 2}, map[uint32]bool{1: true}); !reflect.DeepEqual(got, []uint32{2}) {
		t.Fatalf("got %v", got)
	}
}

func TestHiddenUntilLogoff(t *testing.T) {
	p, _ := newPolicy()
	p.Hidden(2)
	if got := p.ToLaunch([]uint32{1, 2}, nil); !reflect.DeepEqual(got, []uint32{1}) {
		t.Fatalf("hidden: %v", got)
	}
	p.LoggedOff(2)
	if got := p.ToLaunch([]uint32{1, 2}, nil); !reflect.DeepEqual(got, []uint32{1, 2}) {
		t.Fatalf("after logoff: %v", got)
	}
}

func TestBacksOffACrashLoopingTray(t *testing.T) {
	p, c := newPolicy()
	for range 4 { // the first launch and 3 relaunches
		if got := p.ToLaunch([]uint32{1}, nil); len(got) != 1 {
			t.Fatalf("launch refused early")
		}
		p.Launched(1)
		c.t = c.t.Add(time.Minute)
	}
	if got := p.ToLaunch([]uint32{1}, nil); len(got) != 0 {
		t.Fatalf("still relaunching: %v", got)
	}
	c.t = c.t.Add(2 * time.Minute) // 6 min after the first launch
	if got := p.ToLaunch([]uint32{1}, nil); len(got) != 1 {
		t.Fatalf("never relaunched: %v", got)
	}
}

func TestLogoffClearsBackoff(t *testing.T) {
	p, _ := newPolicy()
	for range 4 {
		p.Launched(1)
	}
	p.LoggedOff(1)
	if got := p.ToLaunch([]uint32{1}, nil); len(got) != 1 {
		t.Fatalf("got %v", got)
	}
}

func TestBackoffIsPerSession(t *testing.T) {
	p, _ := newPolicy()
	for range 4 {
		p.Launched(1)
	}
	if got := p.ToLaunch([]uint32{1, 2}, nil); !reflect.DeepEqual(got, []uint32{2}) {
		t.Fatalf("got %v", got)
	}
}
