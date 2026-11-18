package stats

import (
	"context"
	"runtime"
	"sync"
	"testing"
	"time"

	"homeagent/internal/protocol"
)

func fakeSources(now *time.Time, sent, recv *uint64) Sources {
	return Sources{
		CPU:     func() float64 { return 12.5 },
		Memory:  func() (float64, float64) { return 8e9, 32e9 },
		Disks:   func() []protocol.Disk { return []protocol.Disk{{Mount: "C:", Free: 1, Total: 2}} },
		Net:     func() (uint64, uint64) { return *sent, *recv },
		Uptime:  func() int64 { return 3600 },
		GPU:     func(context.Context) *protocol.Gpu { return nil },
		Session: func() (*string, *int64) { return nil, nil },
		Now:     func() time.Time { return *now },
	}
}

func TestNetRateIsTheByteDeltaOverElapsedTime(t *testing.T) {
	now := time.Unix(1000, 0)
	sent, recv := uint64(10_000), uint64(50_000)
	c := NewCollector(fakeSources(&now, &sent, &recv))
	first := c.Sample(context.Background())
	if first.NetUp != 0 || first.NetDown != 0 {
		t.Fatalf("first sample has a rate: %+v", first)
	}
	now = now.Add(2 * time.Second)
	sent += 2_000
	recv += 6_000
	s := c.Sample(context.Background())
	if s.NetUp != 1000 || s.NetDown != 3000 {
		t.Fatalf("got up %v down %v", s.NetUp, s.NetDown)
	}
	if s.CPU != 12.5 || s.RAMUsed != 8e9 || s.RAMTotal != 32e9 || s.UptimeS != 3600 || len(s.Disks) != 1 || s.Gpu != nil {
		t.Fatalf("got %+v", s)
	}
}

func TestCountersThatWentBackwardsGiveZero(t *testing.T) {
	now := time.Unix(1000, 0)
	sent, recv := uint64(10_000), uint64(50_000)
	c := NewCollector(fakeSources(&now, &sent, &recv))
	c.Sample(context.Background())
	now = now.Add(2 * time.Second)
	sent, recv = 100, 100 // an adapter went away
	if s := c.Sample(context.Background()); s.NetUp != 0 || s.NetDown != 0 {
		t.Fatalf("got %+v", s)
	}
}

func TestSamplerSendsUntilStoppedAndLeavesNoGoroutine(t *testing.T) {
	now := time.Unix(1000, 0)
	var sent, recv uint64
	before := runtime.NumGoroutine()
	var mu sync.Mutex
	var got []protocol.Stats
	s := NewSampler(NewCollector(fakeSources(&now, &sent, &recv)), func(st protocol.Stats) {
		mu.Lock()
		got = append(got, st)
		mu.Unlock()
	})
	s.Start(5 * time.Millisecond)
	s.Start(5 * time.Millisecond) // a second start replaces, never doubles
	time.Sleep(40 * time.Millisecond)
	s.Stop()
	s.Stop()
	mu.Lock()
	n := len(got)
	mu.Unlock()
	if n == 0 {
		t.Fatal("nothing sampled")
	}
	time.Sleep(20 * time.Millisecond)
	mu.Lock()
	after := len(got)
	mu.Unlock()
	if after != n {
		t.Fatalf("still sampling after stop: %d → %d", n, after)
	}
	if g := runtime.NumGoroutine(); g > before {
		t.Fatalf("goroutines %d → %d", before, g)
	}
}
