package trayhub

import (
	"context"
	"fmt"
	"sync"
	"time"
)

const (
	msgNotConnected = "Not connected to Home"
	msgNoAnswer     = "Home didn't answer"
)

type checkAnswer struct {
	ok  bool
	msg string
}

// checks is the update.check in flight: every tray asking meanwhile waits on the same answer.
type checks struct {
	mu      sync.Mutex
	waiters []chan checkAnswer
}

// ask sends a check (only for the first waiter) and waits for the answer, the timeout or ctx.
func (c *checks) ask(ctx context.Context, send func() bool, timeout time.Duration) checkAnswer {
	ch := make(chan checkAnswer, 1)
	c.mu.Lock()
	first := len(c.waiters) == 0
	c.waiters = append(c.waiters, ch)
	c.mu.Unlock()
	if first && !send() {
		c.answer(checkAnswer{msg: msgNotConnected})
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case a := <-ch:
		return a
	case <-timer.C:
		c.answer(checkAnswer{msg: msgNoAnswer})
	case <-ctx.Done():
		c.answer(checkAnswer{msg: msgNoAnswer})
	}
	return <-ch
}

// answer ends the check in flight (no-op when there is none).
func (c *checks) answer(a checkAnswer) {
	c.mu.Lock()
	waiters := c.waiters
	c.waiters = nil
	c.mu.Unlock()
	for _, w := range waiters {
		w <- a
	}
}

func offered(version int) checkAnswer {
	return checkAnswer{ok: true, msg: fmt.Sprintf("Updating to version %d…", version)}
}
func upToDate(version int) checkAnswer {
	return checkAnswer{ok: true, msg: fmt.Sprintf("Up to date (version %d)", version)}
}
