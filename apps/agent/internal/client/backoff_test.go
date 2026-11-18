package client

import (
	"testing"
	"time"
)

func TestBackoffDoublesUpToAMinute(t *testing.T) {
	var b Backoff
	want := []int{1, 2, 4, 8, 16, 32, 60, 60}
	for i, s := range want {
		if got := b.Next(); got != time.Duration(s)*time.Second {
			t.Fatalf("step %d: got %v", i, got)
		}
	}
	b.Reset()
	if got := b.Next(); got != time.Second {
		t.Fatalf("after reset: got %v", got)
	}
}
