package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/openilink/openilink-hub/internal/auth"
	"github.com/openilink/openilink-hub/internal/provider"
)

// Messages shown to API clients for upstream send refusals.
const (
	msgNoSession        = "暂无法发送：对方需要先给 Bot 发一条消息"
	msgInvalidRecipient = "接收人无效"
	msgAuthExpired      = "Bot 登录已失效，请重新扫码绑定"
)

// msgQueued is returned when a message was queued instead of sent.
const msgQueued = "对方的接收额度已用完，消息已排队，对方回复 Bot 后自动送达"

// writeQueued writes the 202 response for a queued message.
func writeQueued(w http.ResponseWriter, qe *provider.QueuedError, extra map[string]any) {
	resp := map[string]any{"ok": true, "queued": true, "pending": qe.Pending, "message": msgQueued}
	for k, v := range extra {
		resp[k] = v
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(resp)
}

// sendErrorResponse maps an error returned by Provider.Send to an HTTP status
// and a client-facing message.
//
//	no session         → 409  recipient must message the bot first
//	invalid recipient  → 400
//	auth expired       → 503  bot must be re-bound
//	other upstream     → 502
func sendErrorResponse(err error) (int, string) {
	var se *provider.SendError
	if errors.As(err, &se) {
		switch se.Kind {
		case provider.SendErrNoSession:
			return http.StatusConflict, msgNoSession
		case provider.SendErrInvalidRecipient:
			return http.StatusBadRequest, msgInvalidRecipient
		case provider.SendErrAuthExpired:
			return http.StatusServiceUnavailable, msgAuthExpired
		}
	}
	return http.StatusBadGateway, err.Error()
}

// checkBotSendable is the pre-send gate used by all send endpoints. It only
// rejects bots that are not connected; whether the recipient can receive is
// decided by the upstream (iLink) and surfaced via sendErrorResponse.
//
// This replaced a 24h "fresh context_token" heuristic: live testing showed
// iLink neither requires nor validates context_token, and refuses sends
// (ret=-2) on its own rules regardless of token age.
func checkBotSendable(status string) (bool, string) {
	return checkSendStatus(status, true)
}

// GET /api/bots/{id}/quota — per-recipient send allowance and queue sizes.
func (s *Server) handleBotQuota(w http.ResponseWriter, r *http.Request) {
	botID := r.PathValue("id")
	userID := auth.UserIDFromContext(r.Context())
	bot, err := s.Store.GetBot(botID)
	if err != nil || !s.canManageBot(userID, bot) {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	resp := map[string]any{"enabled": false, "recipients": []any{}}
	if inst, ok := s.BotManager.GetInstance(botID); ok {
		if q := inst.Quota(); q != nil {
			list, err := q.QuotaStatusAll()
			if err != nil {
				jsonError(w, "query failed", http.StatusInternalServerError)
				return
			}
			resp["enabled"] = true
			resp["limit"] = q.Limit()
			if list != nil {
				resp["recipients"] = list
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
