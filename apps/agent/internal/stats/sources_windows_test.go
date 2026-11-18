package stats

import (
	"context"
	"testing"
	"time"
)

func TestSamplesThisPC(t *testing.T) {
	c := NewCollector(DefaultSources())
	c.Sample(context.Background())
	time.Sleep(300 * time.Millisecond)
	s := c.Sample(context.Background())
	if s.RAMTotal <= 0 || s.UptimeS <= 0 || len(s.Disks) == 0 {
		t.Fatalf("got %+v", s)
	}
	user, idle := "", int64(-1)
	if s.User != nil {
		user = *s.User
	}
	if s.IdleS != nil {
		idle = *s.IdleS
	}
	t.Logf("cpu %.1f ram %.1f/%.1f GB disks %+v gpu %+v net %.0f/%.0f B/s up %ds user %q idle %d", s.CPU, s.RAMUsed/1e9, s.RAMTotal/1e9, s.Disks, s.Gpu, s.NetUp, s.NetDown, s.UptimeS, user, idle)
}
