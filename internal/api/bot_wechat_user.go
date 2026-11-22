package api

import (
	"encoding/json"
	"net/http"

	"github.com/openilink/openilink-hub/internal/auth"
	"github.com/openilink/openilink-hub/internal/store"
)

// GET /api/bots/{id}/wechat-user — the WeChat user who scanned the bot's QR
// (iLink id) and, if bound via 服务号网页授权, their real identity.
// For the simplified user-side bot page.
func (s *Server) handleBotWeChatUser(w http.ResponseWriter, r *http.Request) {
	b, err := s.Store.GetBot(r.PathValue("id"))
	if err != nil || !s.canManageBot(auth.UserIDFromContext(r.Context()), b) {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	var creds struct {
		ILinkUserID string `json:"ilink_user_id"`
	}
	json.Unmarshal(b.Credentials, &creds)
	resp := struct {
		ILinkUserID string                `json:"ilink_user_id,omitempty"`
		WeChat      *store.WeChatIdentity `json:"wechat,omitempty"`
	}{ILinkUserID: creds.ILinkUserID}
	if creds.ILinkUserID != "" {
		resp.WeChat, _ = s.Store.GetWeChatIdentity(b.ID, creds.ILinkUserID)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
