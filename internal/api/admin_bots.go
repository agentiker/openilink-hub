package api

import (
	"encoding/json"
	"net/http"
	"sort"

	"github.com/openilink/openilink-hub/internal/store"
)

// adminBot is the read-only view of a bot for the admin "Bot 管理" page.
// Credentials (bot_token etc.) are never included.
type adminBot struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Provider    string `json:"provider"`
	Status      string `json:"status"`
	MsgCount    int64  `json:"msg_count"`
	LastMsgAt   *int64 `json:"last_msg_at,omitempty"`
	CreatedAt   int64  `json:"created_at"`

	Owner struct {
		ID          string `json:"id"`
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		Role        string `json:"role"`
	} `json:"owner"`

	// ILinkUserID is the WeChat user who scanned the bot's QR code.
	ILinkUserID string `json:"ilink_user_id,omitempty"`
	// WeChat is that user's real identity, if bound via 服务号网页授权.
	WeChat *store.WeChatIdentity `json:"wechat,omitempty"`
	// ContactCount is the number of distinct WeChat users who messaged the bot.
	ContactCount int `json:"contact_count"`
}

// GET /api/admin/bots — every bot on the platform with its owner and WeChat user.
func (s *Server) handleAdminListBots(w http.ResponseWriter, r *http.Request) {
	bots, err := s.Store.GetAllBots()
	if err != nil {
		jsonError(w, "list failed", http.StatusInternalServerError)
		return
	}
	users, err := s.Store.ListUsers()
	if err != nil {
		jsonError(w, "list failed", http.StatusInternalServerError)
		return
	}
	byID := make(map[string]store.User, len(users))
	for _, u := range users {
		byID[u.ID] = u
	}

	out := make([]adminBot, 0, len(bots))
	for _, b := range bots {
		ab := adminBot{
			ID: b.ID, Name: b.Name, DisplayName: b.DisplayName, Provider: b.Provider,
			Status: b.Status, MsgCount: b.MsgCount, LastMsgAt: b.LastMsgAt, CreatedAt: b.CreatedAt,
		}
		if inst, ok := s.BotManager.GetInstance(b.ID); ok {
			ab.Status = inst.Status()
		}
		if u, ok := byID[b.UserID]; ok {
			ab.Owner.ID, ab.Owner.Username, ab.Owner.DisplayName, ab.Owner.Role = u.ID, u.Username, u.DisplayName, u.Role
		} else {
			ab.Owner.ID = b.UserID
		}
		var creds struct {
			ILinkUserID string `json:"ilink_user_id"`
		}
		json.Unmarshal(b.Credentials, &creds)
		ab.ILinkUserID = creds.ILinkUserID
		if ab.ILinkUserID != "" {
			ab.WeChat, _ = s.Store.GetWeChatIdentity(b.ID, ab.ILinkUserID)
		}
		if contacts, err := s.Store.ListRecentContacts(b.ID, 1000); err == nil {
			ab.ContactCount = len(contacts)
		}
		out = append(out, ab)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}
