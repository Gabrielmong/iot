package client

import "time"

const (
	minBackoff = time.Second
	maxBackoff = time.Minute
)

// Backoff is the reconnect delay: 1 s, doubling, capped at 60 s. The zero value is ready to use.
type Backoff struct{ next time.Duration }

// Next returns the delay before the next attempt.
func (b *Backoff) Next() time.Duration {
	if b.next == 0 {
		b.next = minBackoff
	}
	d := b.next
	b.next = min(b.next*2, maxBackoff)
	return d
}

// Reset starts over at 1 s (after a connection that lasted).
func (b *Backoff) Reset() { b.next = 0 }
