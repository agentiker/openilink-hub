package ilink

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	ilinksdk "github.com/agentiker/wxilink-sdk-go"
	"github.com/openilink/openilink-hub/internal/provider"
)

func TestToSendError(t *testing.T) {
	cases := []struct {
		name     string
		in       error
		wantKind provider.SendErrorKind
		wantCode int
	}{
		{"no session", &ilinksdk.APIError{Ret: -2, ErrMsg: "prepare failed"}, provider.SendErrNoSession, -2},
		{"invalid", &ilinksdk.APIError{Ret: -3, ErrMsg: "invalid arguments"}, provider.SendErrInvalidRecipient, -3},
		{"expired", &ilinksdk.APIError{ErrCode: -14, ErrMsg: "session timeout"}, provider.SendErrAuthExpired, -14},
		{"other", &ilinksdk.APIError{Ret: -9, ErrMsg: "x"}, provider.SendErrUnknown, -9},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ToSendError(tc.in)
			var se *provider.SendError
			if !errors.As(err, &se) {
				t.Fatalf("got %T, want *provider.SendError", err)
			}
			if se.Kind != tc.wantKind || se.Code != tc.wantCode {
				t.Errorf("got kind=%v code=%d, want kind=%v code=%d", se.Kind, se.Code, tc.wantKind, tc.wantCode)
			}
			var ae *ilinksdk.APIError
			if !errors.As(err, &ae) {
				t.Error("underlying *APIError should stay reachable via Unwrap")
			}
		})
	}

	plain := errors.New("dial tcp: refused")
	if got := ToSendError(plain); got != plain {
		t.Errorf("non-API errors must pass through, got %v", got)
	}
}

// fakeILink serves getupdates (idle) and a configurable sendmessage reply.
func fakeILink(t *testing.T, sendReply string) *httptest.Server {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/getupdates"):
			select {
			case <-r.Context().Done():
			case <-time.After(200 * time.Millisecond):
			}
			w.Write([]byte(`{"ret":0,"msgs":[]}`))
		case strings.HasSuffix(r.URL.Path, "/sendmessage"):
			w.Write([]byte(sendReply))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func startProvider(t *testing.T, baseURL string, onStatus func(string)) *Provider {
	creds, _ := json.Marshal(Credentials{BotToken: "tok", BaseURL: baseURL, ILinkUserID: "me@im.wechat"})
	p := &Provider{}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(func() { cancel(); p.Stop() })
	if err := p.Start(ctx, provider.StartOptions{Credentials: creds, OnStatus: onStatus}); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestSend_Success(t *testing.T) {
	srv := fakeILink(t, `{"message_id":1}`)
	p := startProvider(t, srv.URL, nil)
	id, err := p.Send(context.Background(), provider.OutboundMessage{Text: "hi"})
	if err != nil || id == "" {
		t.Fatalf("got (%q, %v)", id, err)
	}
}

func TestSend_NoSessionIsClassified(t *testing.T) {
	srv := fakeILink(t, `{"ret":-2,"errmsg":"prepare failed"}`)
	p := startProvider(t, srv.URL, nil)
	_, err := p.Send(context.Background(), provider.OutboundMessage{Text: "hi"})
	if kind, ok := provider.SendErrorKindOf(err); !ok || kind != provider.SendErrNoSession {
		t.Fatalf("got %v, want SendErrNoSession", err)
	}
	if p.Status() != "connected" {
		t.Errorf("status = %q, no-session must not change bot status", p.Status())
	}
}

func TestSend_AuthExpiredMarksSessionExpired(t *testing.T) {
	srv := fakeILink(t, `{"errcode":-14,"errmsg":"session timeout"}`)
	var mu sync.Mutex
	var statuses []string
	p := startProvider(t, srv.URL, func(s string) {
		mu.Lock()
		statuses = append(statuses, s)
		mu.Unlock()
	})
	_, err := p.Send(context.Background(), provider.OutboundMessage{Text: "hi"})
	if kind, _ := provider.SendErrorKindOf(err); kind != provider.SendErrAuthExpired {
		t.Fatalf("got %v, want SendErrAuthExpired", err)
	}
	if p.Status() != "session_expired" {
		t.Errorf("status = %q, want session_expired", p.Status())
	}
	mu.Lock()
	defer mu.Unlock()
	if len(statuses) == 0 || statuses[len(statuses)-1] != "session_expired" {
		t.Errorf("OnStatus calls = %v, want last = session_expired", statuses)
	}
}
