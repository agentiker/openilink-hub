package api

import (
	"errors"
	"net/http"

	"github.com/openilink/openilink-hub/internal/provider"
)

// Messages shown to API clients for upstream send refusals.
const (
	msgNoSession        = "暂无法发送：对方需要先给 Bot 发一条消息"
	msgInvalidRecipient = "接收人无效"
	msgAuthExpired      = "Bot 登录已失效，请重新扫码绑定"
)

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
