package api

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

func TestScanLoginPoll_RequiresToken(t *testing.T) {
	env := setupTestEnv(t)

	sid := "bind-scan-log-test-1"
	scanPolls.getOrCreate(sid, &pollState{
		token:      "secret-token",
		scanLogin:  true,
		started:    true, // don't start a real iLink loop
		status:     "scanned",
		qrURL:      "https://example.com/qr",
		lastAccess: time.Now(),
	})
	t.Cleanup(func() { scanPolls.remove(sid) })

	// Missing / wrong token → 404
	for _, q := range []string{"", "?token=nope"} {
		resp, err := http.Get(env.ts.URL + "/api/auth/scan/poll/" + sid + q)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("query %q: want 404, got %d", q, resp.StatusCode)
		}
	}

	// Correct token → snapshot
	resp, err := http.Get(env.ts.URL + "/api/auth/scan/poll/" + sid + "?token=secret-token")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("want 200, got %d", resp.StatusCode)
	}
	var body map[string]any
	json.NewDecoder(resp.Body).Decode(&body)
	if body["status"] != "scanned" || body["qr_url"] != "https://example.com/qr" {
		t.Fatalf("unexpected body: %v", body)
	}
}

func TestScanLoginPoll_ReturnsFinalResult(t *testing.T) {
	env := setupTestEnv(t)

	sid := "bind-scan-log-test-2"
	scanPolls.getOrCreate(sid, &pollState{
		token:      "tok",
		scanLogin:  true,
		started:    true,
		status:     "connected",
		final:      map[string]any{"status": "connected", "bot_id": "b1", "session_token": "s1", "is_new": true},
		lastAccess: time.Now(),
	})
	t.Cleanup(func() { scanPolls.remove(sid) })

	resp, err := http.Get(env.ts.URL + "/api/auth/scan/poll/" + sid + "?token=tok")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body map[string]any
	json.NewDecoder(resp.Body).Decode(&body)
	if body["status"] != "connected" || body["session_token"] != "s1" || body["bot_id"] != "b1" {
		t.Fatalf("unexpected body: %v", body)
	}
}

func TestBindPoll_OwnerOnly(t *testing.T) {
	env := setupTestEnv(t)

	sid := "bind-other-user-test"
	scanPolls.getOrCreate(sid, &pollState{
		ownerID:    "someone-else",
		started:    true,
		status:     "wait",
		lastAccess: time.Now(),
	})
	t.Cleanup(func() { scanPolls.remove(sid) })

	// Unauthenticated → 401
	resp := doJSON(t, env.ts, "GET", "/api/bots/bind/poll/"+sid, nil)
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", resp.StatusCode)
	}

	// Other user's session → 404
	resp = doJSON(t, env.ts, "GET", "/api/bots/bind/poll/"+sid, nil, withCookie(env.cookie))
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("want 404, got %d", resp.StatusCode)
	}

	// Unknown session → 404
	resp = doJSON(t, env.ts, "GET", "/api/bots/bind/poll/does-not-exist", nil, withCookie(env.cookie))
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("want 404, got %d", resp.StatusCode)
	}

	// Own session → 200
	own := "bind-own-user-test"
	scanPolls.getOrCreate(own, &pollState{
		ownerID:    env.user.ID,
		started:    true,
		status:     "scanned",
		lastAccess: time.Now(),
	})
	t.Cleanup(func() { scanPolls.remove(own) })
	resp = doJSON(t, env.ts, "GET", "/api/bots/bind/poll/"+own, nil, withCookie(env.cookie))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("want 200, got %d", resp.StatusCode)
	}
	var body map[string]any
	json.NewDecoder(resp.Body).Decode(&body)
	if body["status"] != "scanned" {
		t.Fatalf("unexpected body: %v", body)
	}
}
