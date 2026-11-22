package api

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestLoginThrottleLocksPerIP(t *testing.T) {
	th := newLoginThrottle()
	now := time.Unix(1_700_000_000, 0)
	th.now = func() time.Time { return now }
	for i := 0; i < th.ipLimit-1; i++ {
		th.fail("1.2.3.4", "u"+string(rune('a'+i)))
	}
	if b, _ := th.blocked("1.2.3.4", "x"); b {
		t.Fatal("locked too early")
	}
	th.fail("1.2.3.4", "z")
	if b, wait := th.blocked("1.2.3.4", "x"); !b || wait != th.lockFor {
		t.Fatalf("want locked for %v, got %v %v", th.lockFor, b, wait)
	}
	if b, _ := th.blocked("5.6.7.8", "x"); b {
		t.Fatal("other IP must not be locked")
	}
	now = now.Add(th.lockFor + time.Second)
	if b, _ := th.blocked("1.2.3.4", "x"); b {
		t.Fatal("lock must expire")
	}
}

func TestLoginThrottleLocksPerUserAndSuccessClears(t *testing.T) {
	th := newLoginThrottle()
	for i := 0; i < th.userLimit; i++ {
		th.fail("10.0.0."+string(rune('0'+i%10)), "HubAdmin") // spread across IPs
	}
	if b, _ := th.blocked("9.9.9.9", "hubadmin"); !b {
		t.Fatal("username must be locked case-insensitively")
	}
	th.succeed("9.9.9.9", "hubadmin")
	if b, _ := th.blocked("9.9.9.9", "hubadmin"); b {
		t.Fatal("success must clear the lock")
	}
}

func TestClientIPTrustsRealIPOnlyFromLoopback(t *testing.T) {
	r := httptest.NewRequest("POST", "/", nil)
	r.RemoteAddr = "127.0.0.1:5555"
	r.Header.Set("X-Real-IP", "203.0.113.9")
	if got := clientIP(r); got != "203.0.113.9" {
		t.Fatalf("proxied: got %s", got)
	}
	r.RemoteAddr = "198.51.100.7:5555"
	if got := clientIP(r); got != "198.51.100.7" {
		t.Fatalf("direct client forged header: got %s", got)
	}
}
