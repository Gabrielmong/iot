// Package stats samples this PC's live numbers, only while the server asks for them.
package stats

import (
	"context"
	"time"

	"homeagent/internal/protocol"
)

// Sources are where each number comes from; DefaultSources reads the real PC, tests inject fakes.
type Sources struct {
	CPU     func() float64               // percent busy since the previous call
	Memory  func() (used, total float64) // bytes
	Disks   func() []protocol.Disk       // fixed drives
	Net     func() (sent, recv uint64)   // total bytes since boot
	Uptime  func() int64                 // seconds
	GPU     func(ctx context.Context) *protocol.Gpu
	Session func() (user *string, idleS *int64) // the signed-in console user, if any
	Now     func() time.Time
}

// Collector turns Sources into protocol.Stats; it remembers the previous network counters for rates.
type Collector struct {
	src      Sources
	prevAt   time.Time
	prevSent uint64
	prevRecv uint64
}

func NewCollector(src Sources) *Collector { return &Collector{src: src} }

// Sample takes one reading. The first one reports no network rate (nothing to compare with).
func (c *Collector) Sample(ctx context.Context) protocol.Stats {
	used, total := c.src.Memory()
	sent, recv := c.src.Net()
	now := c.src.Now()
	user, idle := c.src.Session()
	s := protocol.Stats{
		CPU:      c.src.CPU(),
		RAMUsed:  used,
		RAMTotal: total,
		Gpu:      c.src.GPU(ctx),
		Disks:    c.src.Disks(),
		UptimeS:  c.src.Uptime(),
		User:     user,
		IdleS:    idle,
	}
	if s.Disks == nil {
		s.Disks = []protocol.Disk{}
	}
	if !c.prevAt.IsZero() {
		if secs := now.Sub(c.prevAt).Seconds(); secs > 0 {
			s.NetUp = rate(c.prevSent, sent, secs)
			s.NetDown = rate(c.prevRecv, recv, secs)
		}
	}
	c.prevAt, c.prevSent, c.prevRecv = now, sent, recv
	return s
}

func rate(before, after uint64, secs float64) float64 {
	if after < before {
		return 0
	}
	return float64(after-before) / secs
}
