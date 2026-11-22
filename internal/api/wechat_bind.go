package api

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"html/template"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/openilink/openilink-hub/internal/auth"
	"github.com/openilink/openilink-hub/internal/provider"
	"github.com/openilink/openilink-hub/internal/store"
	"github.com/openilink/openilink-hub/internal/wechatmp"
)

// WeChat identity binding via 服务号网页授权.
//
// iLink only gives an opaque ilink_user_id. To learn who a user really is,
// the bot sends them a link; opening it in WeChat runs the official-account
// web OAuth, and the resulting openid/unionid/nickname/avatar are stored
// against (bot, ilink_user_id).
//
//	POST /api/bots/{id}/wechat/bind-link   owner: create (and optionally send) a link
//	GET  /wx/bind?t=TOKEN                  public: start OAuth (must be opened in WeChat)
//	GET  /wx/bind/callback?code&state      public: finish OAuth, store identity
//
// Requirements: a verified 服务号 (AppID/AppSecret) whose 网页授权域名 is the
// Hub's public origin (-origin / RP_ORIGIN, HTTPS). The domain verification
// file MP_verify_*.txt can be served by the Hub (admin config).

const (
	bindTokenTTL   = 24 * time.Hour
	bindStateTTL   = 10 * time.Minute
	wxConfigPrefix = "wechat_mp."
)

// wechatMPConfig is the 服务号 configuration (DB first, env fallback).
type wechatMPConfig struct {
	AppID      string
	AppSecret  string
	Scope      string // snsapi_userinfo (default) or snsapi_base
	VerifyFile string // e.g. MP_verify_AbCd123.txt
	Source     string // "db" | "env" | ""
}

func (c wechatMPConfig) enabled() bool { return c.AppID != "" && c.AppSecret != "" }

// verifyContent is the expected body of the MP_verify file (the code part).
func (c wechatMPConfig) verifyContent() string {
	return strings.TrimSuffix(strings.TrimPrefix(c.VerifyFile, "MP_verify_"), ".txt")
}

func (s *Server) wechatMPConfig() wechatMPConfig {
	db, _ := s.Store.ListConfigByPrefix(wxConfigPrefix)
	c := wechatMPConfig{
		AppID: db[wxConfigPrefix+"app_id"], AppSecret: db[wxConfigPrefix+"app_secret"],
		Scope: db[wxConfigPrefix+"scope"], VerifyFile: db[wxConfigPrefix+"verify_file"],
	}
	if c.AppID != "" {
		c.Source = "db"
	} else if id := os.Getenv("WECHAT_MP_APP_ID"); id != "" {
		c.AppID, c.AppSecret, c.Source = id, os.Getenv("WECHAT_MP_APP_SECRET"), "env"
	}
	if c.Scope != wechatmp.ScopeBase {
		c.Scope = wechatmp.ScopeUserInfo
	}
	return c
}

func (s *Server) wechatClient(c wechatMPConfig) *wechatmp.Client {
	return &wechatmp.Client{AppID: c.AppID, AppSecret: c.AppSecret}
}

// --- bind tokens (HMAC-signed, stateless) ---

type bindClaims struct {
	BotID       string `json:"b"`
	ILinkUserID string `json:"u"`
	Exp         int64  `json:"e"`
}

func (s *Server) bindKey() []byte {
	h := sha256.Sum256([]byte("wechat-bind:" + s.Config.Secret))
	return h[:]
}

func (s *Server) signBindToken(c bindClaims) string {
	payload, _ := json.Marshal(c)
	p := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, s.bindKey())
	mac.Write([]byte(p))
	return p + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

var errBadBindToken = errors.New("invalid or expired link")

func (s *Server) verifyBindToken(tok string) (*bindClaims, error) {
	p, sig, ok := strings.Cut(tok, ".")
	if !ok {
		return nil, errBadBindToken
	}
	mac := hmac.New(sha256.New, s.bindKey())
	mac.Write([]byte(p))
	want := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(want)) {
		return nil, errBadBindToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(p)
	if err != nil {
		return nil, errBadBindToken
	}
	var c bindClaims
	if json.Unmarshal(raw, &c) != nil || c.BotID == "" || c.ILinkUserID == "" || time.Now().Unix() > c.Exp {
		return nil, errBadBindToken
	}
	return &c, nil
}

// --- OAuth state (WeChat limits state to 128 chars, so keep claims server-side) ---

type wxStateStore struct {
	mu sync.Mutex
	m  map[string]wxState
}

type wxState struct {
	claims bindClaims
	exp    time.Time
}

var wxStates = &wxStateStore{m: map[string]wxState{}}

func (st *wxStateStore) put(c bindClaims) string {
	b := make([]byte, 16)
	rand.Read(b)
	key := hex.EncodeToString(b)
	st.mu.Lock()
	defer st.mu.Unlock()
	now := time.Now()
	for k, v := range st.m {
		if now.After(v.exp) {
			delete(st.m, k)
		}
	}
	st.m[key] = wxState{claims: c, exp: now.Add(bindStateTTL)}
	return key
}

func (st *wxStateStore) take(key string) (*bindClaims, bool) {
	st.mu.Lock()
	defer st.mu.Unlock()
	v, ok := st.m[key]
	delete(st.m, key)
	if !ok || time.Now().After(v.exp) {
		return nil, false
	}
	return &v.claims, true
}

// --- handlers ---

// POST /api/bots/{id}/wechat/bind-link {recipient?, send?, text?}
func (s *Server) handleWeChatBindLink(w http.ResponseWriter, r *http.Request) {
	botID := r.PathValue("id")
	b, err := s.Store.GetBot(botID)
	if err != nil || b.UserID != auth.UserIDFromContext(r.Context()) {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	cfg := s.wechatMPConfig()
	if !cfg.enabled() {
		jsonError(w, "服务号未配置：请管理员在后台填写服务号 AppID/AppSecret", http.StatusPreconditionFailed)
		return
	}
	var req struct {
		Recipient string `json:"recipient"`
		Send      bool   `json:"send"`
		Text      string `json:"text"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	inst, running := s.BotManager.GetInstance(botID)
	if req.Recipient == "" && running {
		if d, ok := unwrapDefaultRecipient(inst.Provider); ok {
			req.Recipient = d
		}
	}
	if req.Recipient == "" {
		jsonError(w, "recipient required", http.StatusBadRequest)
		return
	}

	exp := time.Now().Add(bindTokenTTL)
	link := strings.TrimRight(s.Config.RPOrigin, "/") + "/wx/bind?t=" +
		s.signBindToken(bindClaims{BotID: botID, ILinkUserID: req.Recipient, Exp: exp.Unix()})
	resp := map[string]any{"url": link, "expires_at": exp.Unix(), "recipient": req.Recipient, "sent": false}

	if req.Send {
		if !running {
			jsonError(w, "Bot 未连接", http.StatusServiceUnavailable)
			return
		}
		text := req.Text
		if text == "" {
			text = "请点击链接完成微信身份绑定（24 小时内有效）："
		}
		_, err := inst.Send(r.Context(), provider.OutboundMessage{Recipient: req.Recipient, Text: text + "\n" + link})
		if qe, ok := provider.AsQueued(err); ok {
			resp["queued"], resp["pending"] = true, qe.Pending
		} else if err != nil {
			code, m := sendErrorResponse(err)
			jsonError(w, m, code)
			return
		} else {
			resp["sent"] = true
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func unwrapDefaultRecipient(p provider.Provider) (string, bool) {
	if d, ok := p.(provider.DefaultRecipienter); ok {
		if r := d.DefaultRecipient(); r != "" {
			return r, true
		}
	}
	return "", false
}

// GET /wx/bind?t=TOKEN
func (s *Server) handleWeChatBindStart(w http.ResponseWriter, r *http.Request) {
	claims, err := s.verifyBindToken(r.URL.Query().Get("t"))
	if err != nil {
		renderBindPage(w, http.StatusBadRequest, "链接无效或已过期", "请让 Bot 重新发送绑定链接。")
		return
	}
	cfg := s.wechatMPConfig()
	if !cfg.enabled() {
		renderBindPage(w, http.StatusServiceUnavailable, "暂不可用", "服务号尚未配置。")
		return
	}
	if !strings.Contains(r.UserAgent(), "MicroMessenger") {
		renderBindPage(w, http.StatusOK, "请在微信中打开", "复制此链接，在微信聊天里发送给自己后点击打开。")
		return
	}
	state := wxStates.put(*claims)
	redirect := strings.TrimRight(s.Config.RPOrigin, "/") + "/wx/bind/callback"
	http.Redirect(w, r, s.wechatClient(cfg).AuthorizeURL(redirect, cfg.Scope, state), http.StatusFound)
}

// GET /wx/bind/callback?code=…&state=…
func (s *Server) handleWeChatBindCallback(w http.ResponseWriter, r *http.Request) {
	claims, ok := wxStates.take(r.URL.Query().Get("state"))
	if !ok {
		renderBindPage(w, http.StatusBadRequest, "授权已过期", "请重新点击绑定链接。")
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		renderBindPage(w, http.StatusOK, "已取消", "你没有同意授权，未绑定任何信息。")
		return
	}
	cfg := s.wechatMPConfig()
	client := s.wechatClient(cfg)
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	tok, err := client.Exchange(ctx, code)
	if errors.Is(err, wechatmp.ErrSnapshotUser) {
		renderBindPage(w, http.StatusOK, "需要完整授权", "请点击页面底部的「使用完整服务」后重试。")
		return
	}
	if err != nil {
		slog.Error("wechat bind: exchange failed", "bot", claims.BotID, "err", err)
		renderBindPage(w, http.StatusBadGateway, "绑定失败", "微信授权接口返回错误，请稍后重试。")
		return
	}
	id := &store.WeChatIdentity{
		BotID: claims.BotID, ILinkUserID: claims.ILinkUserID, AppID: cfg.AppID,
		OpenID: tok.OpenID, UnionID: tok.UnionID,
	}
	if tok.Scope == wechatmp.ScopeUserInfo || strings.Contains(tok.Scope, wechatmp.ScopeUserInfo) {
		if u, err := client.UserInfo(ctx, tok); err != nil {
			slog.Warn("wechat bind: userinfo failed", "bot", claims.BotID, "err", err)
		} else {
			id.Nickname, id.AvatarURL = u.Nickname, u.HeadImgURL
			if u.UnionID != "" {
				id.UnionID = u.UnionID
			}
		}
	}
	if err := s.Store.UpsertWeChatIdentity(id); err != nil {
		slog.Error("wechat bind: store failed", "bot", claims.BotID, "err", err)
		renderBindPage(w, http.StatusInternalServerError, "绑定失败", "保存失败，请稍后重试。")
		return
	}
	slog.Info("wechat identity bound", "bot", claims.BotID, "has_unionid", id.UnionID != "", "has_nickname", id.Nickname != "")
	msg := "已完成微信身份绑定，可以关闭此页面。"
	if id.Nickname != "" {
		msg = "已绑定微信用户「" + id.Nickname + "」，可以关闭此页面。"
	}
	renderBindPage(w, http.StatusOK, "绑定成功", msg)
}

// DELETE /api/bots/{id}/wechat/identities/{uid}
func (s *Server) handleWeChatUnbind(w http.ResponseWriter, r *http.Request) {
	botID := r.PathValue("id")
	b, err := s.Store.GetBot(botID)
	if err != nil || b.UserID != auth.UserIDFromContext(r.Context()) {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if err := s.Store.DeleteWeChatIdentity(botID, r.PathValue("uid")); err != nil {
		jsonError(w, "delete failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

var bindPageTmpl = template.Must(template.New("bind").Parse(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{.Title}}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:30vh 24px 0;color:#333">
<h2 style="font-weight:600">{{.Title}}</h2><p style="color:#666;line-height:1.6">{{.Message}}</p></body></html>`))

func renderBindPage(w http.ResponseWriter, status int, title, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	bindPageTmpl.Execute(w, struct{ Title, Message string }{title, message})
}

// --- admin config ---

// GET /api/admin/config/wechat-mp
func (s *Server) handleGetWeChatMPConfig(w http.ResponseWriter, r *http.Request) {
	c := s.wechatMPConfig()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"app_id": c.AppID, "app_secret": maskSecret(c.AppSecret), "scope": c.Scope,
		"verify_file": c.VerifyFile, "enabled": c.enabled(), "source": c.Source,
		"callback_url": strings.TrimRight(s.Config.RPOrigin, "/") + "/wx/bind/callback",
	})
}

// PUT /api/admin/config/wechat-mp {app_id?, app_secret?, scope?, verify_file?}
//
// app_id may be omitted to only set the domain verification file: the
// 网页授权域名 is verified in the 公众平台 before credentials are entered.
func (s *Server) handleSetWeChatMPConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppID      string `json:"app_id"`
		AppSecret  string `json:"app_secret"`
		Scope      string `json:"scope"`
		VerifyFile string `json:"verify_file"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	req.AppID = strings.TrimSpace(req.AppID)
	if req.AppID == "" && req.VerifyFile == "" {
		jsonError(w, "app_id or verify_file required", http.StatusBadRequest)
		return
	}
	if req.Scope != "" && req.Scope != wechatmp.ScopeBase && req.Scope != wechatmp.ScopeUserInfo {
		jsonError(w, "scope must be snsapi_userinfo or snsapi_base", http.StatusBadRequest)
		return
	}
	if req.VerifyFile != "" && !validVerifyFile(req.VerifyFile) {
		jsonError(w, "verify_file must look like MP_verify_xxx.txt", http.StatusBadRequest)
		return
	}
	set := func(k, v string) { s.Store.SetConfig(wxConfigPrefix+k, v) }
	if req.AppID != "" {
		set("app_id", req.AppID)
	}
	// Keep the stored secret when the client echoes back the masked value or omits it.
	if req.AppSecret != "" && !strings.Contains(req.AppSecret, "*") {
		set("app_secret", strings.TrimSpace(req.AppSecret))
	}
	set("scope", req.Scope)
	set("verify_file", req.VerifyFile)
	s.handleGetWeChatMPConfig(w, r)
}

// DELETE /api/admin/config/wechat-mp
func (s *Server) handleDeleteWeChatMPConfig(w http.ResponseWriter, r *http.Request) {
	for _, k := range []string{"app_id", "app_secret", "scope", "verify_file"} {
		s.Store.DeleteConfig(wxConfigPrefix + k)
	}
	w.WriteHeader(http.StatusNoContent)
}

func validVerifyFile(name string) bool {
	if !strings.HasPrefix(name, "MP_verify_") || !strings.HasSuffix(name, ".txt") {
		return false
	}
	code := strings.TrimSuffix(strings.TrimPrefix(name, "MP_verify_"), ".txt")
	if code == "" || len(code) > 64 {
		return false
	}
	for _, c := range code {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9') {
			return false
		}
	}
	return true
}

// withMPVerify serves the 服务号 domain verification file in front of next.
func (s *Server) withMPVerify(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/MP_verify_") {
			if c := s.wechatMPConfig(); c.VerifyFile != "" && r.URL.Path == "/"+c.VerifyFile {
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				w.Write([]byte(c.verifyContent()))
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
