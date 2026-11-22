package api

import (
	"errors"
	"net/http"

	"github.com/openilink/openilink-hub/internal/store"
)

// Login entry points:
//
//	/login         regular users — WeChat scan only (POST /api/auth/scan/*)
//	/admin/login   administrators — username/password and passkey
//
// Password login, passkey login and OAuth/OIDC login are therefore limited to
// administrator accounts, and self-registration (password or passkey) is only
// open while the platform has no users at all, to create the first
// superadmin. Members are created by WeChat scan login (subject to the
// registration switch) or by an administrator.

const (
	msgScanOnly           = "普通用户请使用微信扫码登录"
	msgRegistrationClosed = "注册已关闭：普通用户请使用微信扫码登录，管理员账号请由管理员在后台创建"
)

var errAdminOnlyLogin = errors.New(msgScanOnly)

// adminLoginAllowed reports whether u may use the administrator login methods.
func adminLoginAllowed(u *store.User) bool {
	return u != nil && store.IsAdmin(u.Role)
}

// selfRegistrationBlocked writes 403 and returns true unless the platform has
// no users yet (bootstrap of the first superadmin).
func (s *Server) selfRegistrationBlocked(w http.ResponseWriter) bool {
	if count, _ := s.Store.UserCount(); count > 0 {
		jsonError(w, msgRegistrationClosed, http.StatusForbidden)
		return true
	}
	return false
}
