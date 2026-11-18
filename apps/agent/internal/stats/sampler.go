package stats

import (
	"context"
	"sync"
	"time"

	"homeagent/internal/protocol"
)

// Sampler sends a sample every interval between Start and Stop; nothing runs otherwise.
type Sampler struct {
	c    *Collector
	send func(protocol.Stats)

	mu     sync.Mutex
	cancel context.CancelFunc
	done   chan struct{}
}

func NewSampler(c *Collector, send func(protocol.Stats)) *Sampler {
	return &Sampler{c: c, send: send}
}

// Start begins sampling (restarting at the new interval if already running).
func (s *Sampler) Start(interval time.Duration) {
	s.Stop()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	s.mu.Lock()
	s.cancel, s.done = cancel, done
	s.mu.Unlock()
	go s.loop(ctx, interval, done)
}

// Stop ends sampling and waits for the loop to finish. Safe when not running.
func (s *Sampler) Stop() {
	s.mu.Lock()
	cancel, done := s.cancel, s.done
	s.cancel, s.done = nil, nil
	s.mu.Unlock()
	if cancel != nil {
		cancel()
		<-done
	}
}

func (s *Sampler) loop(ctx context.Context, interval time.Duration, done chan struct{}) {
	defer close(done)
	t := time.NewTicker(interval)
	defer t.Stop()
	s.c.Sample(ctx) // primes CPU and network baselines
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			st := s.c.Sample(ctx)
			if ctx.Err() == nil {
				s.send(st)
			}
		}
	}
}
