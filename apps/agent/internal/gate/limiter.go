package gate

import (
	"sync"
	"time"
)

// A key cannot be guessed; the ceiling only keeps a scanner from filling the site's logs through the gate.
const (
	failureCeiling = 20
	failureWindow  = 10 * time.Minute
	trackedCallers = 10000
)

type tally struct {
	count int
	since time.Time
}

type limiter struct {
	mu      sync.Mutex
	now     func() time.Time
	callers map[string]tally
}

func newLimiter(now func() time.Time) *limiter {
	return &limiter{now: now, callers: map[string]tally{}}
}

func (l *limiter) blocked(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	return l.current(ip).count >= failureCeiling
}

// Records one refused key and says whether the caller is now over the ceiling.
func (l *limiter) failed(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	if len(l.callers) >= trackedCallers {
		l.sweep()
	}

	held := l.current(ip)
	held.count++
	l.callers[ip] = held

	return held.count > failureCeiling
}

func (l *limiter) current(ip string) tally {
	held, known := l.callers[ip]
	if !known || l.now().Sub(held.since) > failureWindow {
		return tally{since: l.now()}
	}

	return held
}

func (l *limiter) sweep() {
	for ip, held := range l.callers {
		if l.now().Sub(held.since) > failureWindow {
			delete(l.callers, ip)
		}
	}

	if len(l.callers) >= trackedCallers {
		clear(l.callers)
	}
}
