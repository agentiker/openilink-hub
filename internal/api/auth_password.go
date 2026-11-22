package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/openilink/openilink-hub/internal/auth"
	"github.com/openilink/openilink-hub/internal/store"
)

// --- Password auth ---

func (s *Server) handlePasswordRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username    string `json:"username"`
		Password    string `json:"password"`
		Email       string `json:"email"`
		DisplayName string `json:"display_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Username == "" || req.Password == "" {
		jsonError(w, "username and password required", http.StatusBadRequest)
		return
	}
	if err := store.ValidateUsername(req.Username); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if len(req.Password) < 8 {
		jsonError(w, "password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	// Self-registration only bootstraps the first superadmin; members use
	// WeChat scan login, other administrators are created in the admin panel.
	if s.selfRegistrationBlocked(w) {
		return
	}
	count, _ := s.Store.UserCount()

	// Check if username taken
	if _, err := s.Store.GetUserByUsername(req.Username); err == nil {
		jsonError(w, "username already taken", http.StatusConflict)
		return
	}

	displayName := req.DisplayName
	if displayName == "" {
		displayName = req.Username
	}

	role := store.RoleMember
	if count == 0 {
		role = store.RoleSuperAdmin
	}

	hash := auth.HashPassword(req.Password)
	user, err := s.Store.CreateUserFull(req.Username, req.Email, displayName, hash, role)
	if err != nil {
		jsonError(w, "create user failed", http.StatusInternalServerError)
		return
	}

	token, _ := auth.CreateSession(s.Store, user.ID)
	setSessionCookie(w, token)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ok": true, "user": user})
}

func (s *Server) handlePasswordLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" || req.Password == "" {
		jsonError(w, "username and password required", http.StatusBadRequest)
		return
	}

	ip := clientIP(r)
	if locked, wait := adminLoginThrottle.blocked(ip, req.Username); locked {
		w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
		jsonError(w, "too many failed attempts, try again later", http.StatusTooManyRequests)
		return
	}

	user, err := s.Store.GetUserByUsername(req.Username)
	if err != nil {
		adminLoginThrottle.fail(ip, req.Username)
		jsonError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if user.Status != store.StatusActive {
		jsonError(w, "account disabled", http.StatusForbidden)
		return
	}
	if user.PasswordHash == "" || !auth.CheckPassword(req.Password, user.PasswordHash) {
		adminLoginThrottle.fail(ip, req.Username)
		jsonError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	adminLoginThrottle.succeed(ip, req.Username)
	// Password login is the administrator entry (/admin/login).
	if !adminLoginAllowed(user) {
		jsonError(w, msgScanOnly, http.StatusForbidden)
		return
	}

	token, _ := auth.CreateSession(s.Store, user.ID)
	setSessionCookie(w, token)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ok": true, "user": user})
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.NewPassword == "" {
		jsonError(w, "new_password required", http.StatusBadRequest)
		return
	}
	if len(req.NewPassword) < 8 {
		jsonError(w, "password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	user, err := s.Store.GetUserByID(userID)
	if err != nil {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	// If user already has a password, verify old password
	if user.PasswordHash != "" {
		if req.OldPassword == "" || !auth.CheckPassword(req.OldPassword, user.PasswordHash) {
			jsonError(w, "old password incorrect", http.StatusUnauthorized)
			return
		}
	}

	hash := auth.HashPassword(req.NewPassword)
	if err := s.Store.UpdateUserPassword(userID, hash); err != nil {
		jsonError(w, "update failed", http.StatusInternalServerError)
		return
	}
	jsonOK(w)
}
