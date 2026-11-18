// Package trays decides when the service starts a tray in a signed-in session, and (on Windows) starts them.
package trays

import (
	"sort"
	"sync"
	"time"
)

// A tray that keeps dying is relaunched at most maxRelaunches times per window.
const (
	maxRelaunches = 3
	window        = 5 * time.Minute
)

// Policy is which sessions should get a tray now. Safe for concurrent use.
type Policy struct {
	Now   func() time.Time
	Logon func(session uint32) int64    // when session's sign-in began (FILETIME); tells reused ids apart
	Save  func(hidden map[uint32]int64) // persists the hidden sessions (session → Logon), so a restart keeps them

	mu       sync.Mutex
	hidden   map[uint32]int64 // session → the Logon it was hidden in
	launches map[uint32][]time.Time
}

func (p *Policy) init() {
	if p.hidden == nil {
		p.hidden = map[uint32]int64{}
		p.launches = map[uint32][]time.Time{}
	}
}

// ToLaunch is the sessions (sorted) that have nobody's tray running, aren't hidden and aren't backing off.
func (p *Policy) ToLaunch(sessions []uint32, running map[uint32]bool) []uint32 {
	p.mu.Lock()
	p.init()
	var out []uint32
	changed := false
	for _, s := range sessions {
		if logon, ok := p.hidden[s]; ok {
			if logon == p.logon(s) {
				continue
			}
			delete(p.hidden, s) // hidden in an earlier sign-in that had the same id
			changed = true
		}
		if running[s] || p.recentLocked(s) > maxRelaunches {
			continue
		}
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	p.unlockSaving(changed)
	return out
}

func (p *Policy) logon(s uint32) int64 {
	if p.Logon == nil {
		return 0
	}
	return p.Logon(s)
}

// unlockSaving releases mu and, when the hidden sessions changed, hands a copy to Save.
func (p *Policy) unlockSaving(changed bool) {
	var snapshot map[uint32]int64
	if changed && p.Save != nil {
		snapshot = make(map[uint32]int64, len(p.hidden))
		for s, l := range p.hidden {
			snapshot[s] = l
		}
	}
	p.mu.Unlock()
	if snapshot != nil {
		p.Save(snapshot)
	}
}

// recentLocked counts launches within the window (and forgets older ones).
func (p *Policy) recentLocked(s uint32) int {
	cutoff := p.Now().Add(-window)
	kept := p.launches[s][:0]
	for _, t := range p.launches[s] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	p.launches[s] = kept
	return len(kept)
}

// Launched records a tray started in session.
func (p *Policy) Launched(s uint32) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.init()
	p.launches[s] = append(p.launches[s], p.Now())
}

// Hidden: the person chose "Hide until next sign-in" in session.
func (p *Policy) Hidden(s uint32) {
	p.mu.Lock()
	p.init()
	p.hidden[s] = p.logon(s)
	p.unlockSaving(true)
}

// LoggedOff forgets session (its id may be reused by the next sign-in).
func (p *Policy) LoggedOff(s uint32) {
	p.mu.Lock()
	p.init()
	_, was := p.hidden[s]
	delete(p.hidden, s)
	delete(p.launches, s)
	p.unlockSaving(was)
}
