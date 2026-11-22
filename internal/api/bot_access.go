package api

import "github.com/openilink/openilink-hub/internal/store"

// isAdminUser reports whether userID has the admin or superadmin role.
func (s *Server) isAdminUser(userID string) bool {
	if userID == "" {
		return false
	}
	u, err := s.Store.GetUserByID(userID)
	return err == nil && store.IsAdmin(u.Role)
}

// canManageBot reports whether userID may view and manage bot b: its owner,
// or any platform administrator (admins manage every bot on the platform).
func (s *Server) canManageBot(userID string, b *store.Bot) bool {
	if b == nil {
		return false
	}
	return b.UserID == userID || s.isAdminUser(userID)
}
