package api

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// loginThrottle slows password guessing against the administrator entry.
// Failures are counted per client IP and per username inside a sliding
// window; once a key reaches its limit it is locked for lockFor. A
// successful login clears both keys. State is in memory: a restart resets it,
// which is acceptable for a single-instance deployment.
type loginThrottle struct {
	mu        sync.Mutex
	window    time.Duration
	lockFor   time.Duration
	ipLimit   int
	userLimit int
	entries   map[string]*throttleEntry
	now       func() time.Time
}

type throttleEntry struct {
	failures    int
	first       time.Time
	lockedUntil time.Time
}

func newLoginThrottle() *loginThrottle {
	return &loginThrottle{
		window:    15 * time.Minute,
		lockFor:   15 * time.Minute,
		ipLimit:   10,
		userLimit: 20, // higher than ipLimit so one attacker cannot trivially lock the admin out
		entries:   map[string]*throttleEntry{},
		now:       time.Now,
	}
}

var adminLoginThrottle = newLoginThrottle()

// blocked reports whether either key is locked and, if so, how long remains.
func (t *loginThrottle) blocked(ip, username string) (bool, time.Duration) {
	t.mu.Lock()
	defer t.mu.Unlock()
	now := t.now()
	var wait time.Duration
	for _, k := range []string{"ip:" + ip, "user:" + strings.ToLower(username)} {
		if e := t.entries[k]; e != nil && now.Before(e.lockedUntil) {
			if d := e.lockedUntil.Sub(now); d > wait {
				wait = d
			}
		}
	}
	return wait > 0, wait
}

func (t *loginThrottle) fail(ip, username string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	now := t.now()
	t.bump("ip:"+ip, t.ipLimit, now)
	t.bump("user:"+strings.ToLower(username), t.userLimit, now)
	if len(t.entries) > 10000 { // bound memory under a spray of usernames/IPs
		for k, e := range t.entries {
			if now.Sub(e.first) > t.window && now.After(e.lockedUntil) {
				delete(t.entries, k)
			}
		}
	}
}

func (t *loginThrottle) bump(key string, limit int, now time.Time) {
	e := t.entries[key]
	if e == nil || (now.Sub(e.first) > t.window && now.After(e.lockedUntil)) {
		e = &throttleEntry{first: now}
		t.entries[key] = e
	}
	e.failures++
	if e.failures >= limit {
		e.lockedUntil = now.Add(t.lockFor)
		e.failures = 0
		e.first = now
	}
}

func (t *loginThrottle) succeed(ip, username string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.entries, "ip:"+ip)
	delete(t.entries, "user:"+strings.ToLower(username))
}

// clientIP returns the caller's address. X-Real-IP is trusted only when the
// request comes from loopback, i.e. from the local reverse proxy (nginx sets
// it to $remote_addr); otherwise a client could forge it to dodge throttling.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		if real := strings.TrimSpace(r.Header.Get("X-Real-IP")); real != "" {
			return real
		}
	}
	return host
}
