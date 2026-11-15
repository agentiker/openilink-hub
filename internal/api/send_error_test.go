package api

import (
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/openilink/openilink-hub/internal/provider"
)

func TestSendErrorResponse(t *testing.T) {
	cases := []struct {
		name     string
		err      error
		wantCode int
		wantMsg  string
	}{
		{"no session", &provider.SendError{Kind: provider.SendErrNoSession, Code: -2}, http.StatusConflict, msgNoSession},
		{"invalid recipient", &provider.SendError{Kind: provider.SendErrInvalidRecipient, Code: -3}, http.StatusBadRequest, msgInvalidRecipient},
		{"auth expired", &provider.SendError{Kind: provider.SendErrAuthExpired, Code: -14}, http.StatusServiceUnavailable, msgAuthExpired},
		{"wrapped", fmt.Errorf("upload: %w", &provider.SendError{Kind: provider.SendErrNoSession}), http.StatusConflict, msgNoSession},
		{"unknown upstream", &provider.SendError{Kind: provider.SendErrUnknown, Code: -9, Msg: "boom"}, http.StatusBadGateway, "send refused (unknown, code=-9): boom"},
		{"transport", errors.New("dial tcp: timeout"), http.StatusBadGateway, "dial tcp: timeout"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			code, msg := sendErrorResponse(tc.err)
			if code != tc.wantCode || msg != tc.wantMsg {
				t.Errorf("got (%d, %q), want (%d, %q)", code, msg, tc.wantCode, tc.wantMsg)
			}
		})
	}
}

func TestCheckBotSendable(t *testing.T) {
	cases := []struct {
		status string
		want   bool
	}{
		{"connected", true},
		{"session_expired", false},
		{"disconnected", false},
		{"error", false},
	}
	for _, tc := range cases {
		if got, _ := checkBotSendable(tc.status); got != tc.want {
			t.Errorf("checkBotSendable(%q) = %v, want %v", tc.status, got, tc.want)
		}
	}
}
