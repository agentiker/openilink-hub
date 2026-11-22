package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/openilink/openilink-hub/internal/auth"
	ilinkProvider "github.com/openilink/openilink-hub/internal/provider/ilink"
)

// --- HTTP short-poll variant of the QR scan flows ---
//
// The WebSocket status endpoints (/api/auth/scan/status, /api/bots/bind/status)
// need a long-lived connection, which serverless callers (e.g. a WeChat mini
// program going through a cloud function) cannot hold. The poll endpoints
// below run the iLink long-poll loop in a background goroutine and let the
// caller fetch the latest snapshot with cheap, short HTTP requests.
//
// Scan-login sessions are anonymous, so /api/auth/scan/start hands out a
// random poll_token that must accompany every poll; otherwise the predictable
// session ID alone would be enough to steal the resulting session token.

const (
	pollIdleTimeout = 2 * time.Minute  // stop the loop if nobody polls for this long
	pollMaxLifetime = 10 * time.Minute // hard cap for a single flow
	pollResultTTL   = 5 * time.Minute  // keep a terminal result around for late polls
)

type pollState struct {
	mu         sync.Mutex
	token      string // required for scan-login polls; empty for bind polls
	ownerID    string // Hub user who started the bind; empty for scan-login
	scanLogin  bool
	started    bool
	status     string // wait | scanned | connected | error
	qrURL      string
	final      map[string]any
	lastAccess time.Time
}

func (p *pollState) snapshot() map[string]any {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.lastAccess = time.Now()
	if p.final != nil {
		out := make(map[string]any, len(p.final))
		for k, v := range p.final {
			out[k] = v
		}
		return out
	}
	return map[string]any{"status": p.status, "qr_url": p.qrURL}
}

type pollRegistry struct {
	mu sync.Mutex
	m  map[string]*pollState
}

var scanPolls = &pollRegistry{m: make(map[string]*pollState)}

func (r *pollRegistry) get(id string) *pollState {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.m[id]
}

// getOrCreate returns the existing state, or stores and returns fresh.
func (r *pollRegistry) getOrCreate(id string, fresh *pollState) *pollState {
	r.mu.Lock()
	defer r.mu.Unlock()
	if p, ok := r.m[id]; ok {
		return p
	}
	r.m[id] = fresh
	return fresh
}

func (r *pollRegistry) remove(id string) {
	r.mu.Lock()
	delete(r.m, id)
	r.mu.Unlock()
}

func newPollToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// registerScanPoll is called by handleScanLoginStart so a later poll can be
// authorised with the returned token.
func registerScanPoll(sessionID, qrURL string) string {
	token := newPollToken()
	scanPolls.getOrCreate(sessionID, &pollState{
		token:      token,
		scanLogin:  true,
		status:     "wait",
		qrURL:      qrURL,
		lastAccess: time.Now(),
	})
	// Drop never-polled entries eventually.
	time.AfterFunc(pollMaxLifetime+pollResultTTL, func() { scanPolls.remove(sessionID) })
	return token
}

// ensureLoop starts the background poll loop once per session.
func (s *Server) ensureLoop(sessionID string, p *pollState) {
	p.mu.Lock()
	if p.started {
		p.mu.Unlock()
		return
	}
	p.started = true
	p.mu.Unlock()
	go s.runPollLoop(sessionID, p)
}

func (s *Server) runPollLoop(sessionID string, p *pollState) {
	ctx, cancel := context.WithTimeout(context.Background(), pollMaxLifetime)
	defer cancel()

	setFinal := func(v map[string]any) {
		p.mu.Lock()
		p.final = v
		if st, ok := v["status"].(string); ok {
			p.status = st
		}
		p.mu.Unlock()
		time.AfterFunc(pollResultTTL, func() { scanPolls.remove(sessionID) })
	}

	// Adapter so the existing completion helpers can report into this state.
	sendEvent := func(event, data string) {
		var fields map[string]any
		_ = json.Unmarshal([]byte(data), &fields)
		if fields == nil {
			fields = map[string]any{}
		}
		if event == "error" {
			fields["status"] = "error"
		}
		setFinal(fields)
	}

	for {
		p.mu.Lock()
		idle := time.Since(p.lastAccess)
		p.mu.Unlock()
		if idle > pollIdleTimeout {
			slog.Info("scan poll idle, stopping", "session", sessionID)
			scanPolls.remove(sessionID)
			return
		}
		if ctx.Err() != nil {
			setFinal(map[string]any{"status": "error", "message": "二维码已过期，请重新开始"})
			return
		}

		result, err := ilinkProvider.PollBind(ctx, sessionID)
		if err != nil {
			if ctx.Err() != nil {
				continue // handled at loop head
			}
			setFinal(map[string]any{"status": "error", "message": "poll failed"})
			return
		}

		switch result.Status {
		case "wait", "scanned":
			p.mu.Lock()
			p.status = result.Status
			p.mu.Unlock()
		case "expired":
			p.mu.Lock()
			p.status = "wait"
			p.qrURL = result.QRURL
			p.mu.Unlock()
		case "confirmed":
			if p.scanLogin {
				s.completeScanLogin(result, sendEvent)
			} else {
				s.completeBind(p.ownerID, result, sendEvent)
			}
			return
		default:
			// Unknown status: back off a little to avoid a hot loop.
			time.Sleep(time.Second)
		}
	}
}

// GET /api/auth/scan/poll/{sessionID}?token=...
// Anonymous: authorised by the poll_token returned from /api/auth/scan/start.
func (s *Server) handleScanLoginPoll(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionID")
	p := scanPolls.get(sessionID)
	if p == nil || !p.scanLogin || p.token == "" || r.URL.Query().Get("token") != p.token {
		jsonError(w, "session not found", http.StatusNotFound)
		return
	}
	s.ensureLoop(sessionID, p)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(p.snapshot())
}

// GET /api/bots/bind/poll/{sessionID}
// Requires a logged-in user who owns the bind session.
func (s *Server) handleBindPoll(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionID")
	userID := auth.UserIDFromContext(r.Context())

	p := scanPolls.get(sessionID)
	if p == nil {
		ilinkProvider.PendingBinds.Lock()
		entry, ok := ilinkProvider.PendingBinds.M[sessionID]
		ilinkProvider.PendingBinds.Unlock()
		if !ok || entry.UserID != userID {
			jsonError(w, "session not found", http.StatusNotFound)
			return
		}
		p = scanPolls.getOrCreate(sessionID, &pollState{
			ownerID:    userID,
			status:     "wait",
			lastAccess: time.Now(),
		})
	}
	if p.scanLogin || p.ownerID != userID {
		jsonError(w, "session not found", http.StatusNotFound)
		return
	}
	s.ensureLoop(sessionID, p)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(p.snapshot())
}
