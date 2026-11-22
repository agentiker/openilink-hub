package api

import (
	"context"
	"errors"
	"html/template"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/openilink/openilink-hub/internal/auth"
	"github.com/openilink/openilink-hub/internal/provider"
	"github.com/openilink/openilink-hub/internal/store"
	"github.com/openilink/openilink-hub/internal/wechatmp"
)

// Mobile one-tap login (stage 2 of the two-stage onboarding).
//
//	Stage 1 — registration: scan the ClawBot QR at /login with a second
//	screen (iLink only accepts a camera scan; opening the bind link or
//	long-pressing the QR inside WeChat does nothing — verified). After a new
//	bot is created, the bot queues an identity-binding link for the user.
//
//	Stage 2 — login: inside WeChat open https://<origin>/m (fixed QR code,
//	服务号 menu, bookmark). 服务号网页授权 (snsapi_base, silent) yields the
//	openid/unionid; the identity bound in stage 1 maps it to the Hub account,
//	which is logged in directly.
//
//	GET /m           start (must be opened in WeChat)
//	GET /m/callback  finish: find the account, set the session, go to /dashboard

// GET /m
func (s *Server) handleMobileLogin(w http.ResponseWriter, r *http.Request) {
	cfg := s.wechatMPConfig()
	if !cfg.enabled() {
		renderMobilePage(w, http.StatusServiceUnavailable, mobilePage{
			Title: "暂不可用", Message: "平台尚未配置微信服务号，暂时无法一键登录。",
			Links: []mobileLink{{"电脑扫码登录", "/login"}},
		})
		return
	}
	if !strings.Contains(r.UserAgent(), "MicroMessenger") {
		renderMobilePage(w, http.StatusOK, mobilePage{
			Title:   "请在微信中打开",
			Message: "用手机微信扫描登录页上的「手机一键登录」二维码，或在微信里打开本链接即可一键登录。",
			Links:   []mobileLink{{"电脑扫码登录 / 注册", "/login"}},
		})
		return
	}
	state := wxStates.putState(wxState{purpose: stateLogin})
	redirect := strings.TrimRight(s.Config.RPOrigin, "/") + "/m/callback"
	// snsapi_base: silent, no consent page — only the openid/unionid is needed.
	http.Redirect(w, r, s.wechatClient(cfg).AuthorizeURL(redirect, wechatmp.ScopeBase, state), http.StatusFound)
}

// GET /m/callback?code=…&state=…
func (s *Server) handleMobileLoginCallback(w http.ResponseWriter, r *http.Request) {
	if _, ok := wxStates.take(r.URL.Query().Get("state"), stateLogin); !ok {
		renderMobilePage(w, http.StatusBadRequest, mobilePage{
			Title: "登录已过期", Message: "请重新打开登录入口。", Links: []mobileLink{{"重新登录", "/m"}},
		})
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		renderMobilePage(w, http.StatusOK, mobilePage{Title: "已取消", Message: "未完成微信授权。", Links: []mobileLink{{"重新登录", "/m"}}})
		return
	}
	cfg := s.wechatMPConfig()
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	tok, err := s.wechatClient(cfg).Exchange(ctx, code)
	if errors.Is(err, wechatmp.ErrSnapshotUser) {
		renderMobilePage(w, http.StatusOK, mobilePage{Title: "需要完整授权", Message: "请点击页面底部的「使用完整服务」后重试。", Links: []mobileLink{{"重新登录", "/m"}}})
		return
	}
	if err != nil {
		slog.Error("mobile login: exchange failed", "err", err)
		renderMobilePage(w, http.StatusBadGateway, mobilePage{Title: "登录失败", Message: "微信授权接口返回错误，请稍后重试。", Links: []mobileLink{{"重试", "/m"}}})
		return
	}

	user, status := s.mobileLoginUser(cfg.AppID, tok.OpenID, tok.UnionID)
	switch status {
	case mobileLoginNoAccount:
		renderMobilePage(w, http.StatusOK, mobilePage{
			Title: "还没有关联账号",
			Message: "首次使用请先在电脑上打开 " + hostOf(s.Config.RPOrigin) + "/login ，用微信扫码注册并绑定 Bot；" +
				"注册后在微信里点开 Bot 发来的身份绑定链接，之后就可以在这里一键登录。",
		})
		return
	case mobileLoginAdmin:
		renderMobilePage(w, http.StatusOK, mobilePage{
			Title: "请使用管理员入口", Message: "管理员账号请在管理员登录页使用账号密码或通行密钥登录。",
			Links: []mobileLink{{"管理员登录", "/admin/login"}},
		})
		return
	case mobileLoginDisabled:
		renderMobilePage(w, http.StatusForbidden, mobilePage{Title: "账号已停用", Message: "请联系平台管理员。"})
		return
	}

	token, err := auth.CreateSession(s.Store, user.ID)
	if err != nil {
		renderMobilePage(w, http.StatusInternalServerError, mobilePage{Title: "登录失败", Message: "请稍后重试。", Links: []mobileLink{{"重试", "/m"}}})
		return
	}
	setSessionCookie(w, token)
	slog.Info("mobile one-tap login", "user", user.ID, "via_unionid", tok.UnionID != "")
	http.Redirect(w, r, "/dashboard", http.StatusFound)
}

type mobileLoginStatus int

const (
	mobileLoginOK mobileLoginStatus = iota
	mobileLoginNoAccount
	mobileLoginAdmin
	mobileLoginDisabled
)

// mobileLoginUser maps a WeChat identity to the Hub account owning the bot it
// was bound through. The most recently bound identity wins.
func (s *Server) mobileLoginUser(appID, openID, unionID string) (*store.User, mobileLoginStatus) {
	ids, err := s.Store.FindWeChatIdentities(appID, openID, unionID)
	if err != nil || len(ids) == 0 {
		return nil, mobileLoginNoAccount
	}
	for _, id := range ids {
		b, err := s.Store.GetBot(id.BotID)
		if err != nil {
			continue
		}
		u, err := s.Store.GetUserByID(b.UserID)
		if err != nil {
			continue
		}
		// Administrators sign in at /admin/login only.
		if store.IsAdmin(u.Role) {
			return nil, mobileLoginAdmin
		}
		if u.Status != store.StatusActive {
			return nil, mobileLoginDisabled
		}
		return u, mobileLoginOK
	}
	return nil, mobileLoginNoAccount
}

// offerIdentityBinding queues a binding link to the WeChat user who just
// registered a bot (stage 1 → 2). iLink only delivers after the user has
// messaged the bot, so the quota layer queues it and sends it on their first
// message. No-op when the 服务号 is not configured or the identity exists.
func (s *Server) offerIdentityBinding(botID, ilinkUserID string) {
	if !s.wechatMPConfig().enabled() || ilinkUserID == "" {
		return
	}
	if id, _ := s.Store.GetWeChatIdentity(botID, ilinkUserID); id != nil {
		return
	}
	inst, ok := s.BotManager.GetInstance(botID)
	if !ok {
		return
	}
	link, err := s.newBindLinkURL(botID, ilinkUserID, time.Now().Add(7*24*time.Hour))
	if err != nil {
		slog.Error("offer identity binding: create link failed", "bot", botID, "err", err)
		return
	}
	text := "欢迎使用 Hi微连！点击下面的链接完成微信身份绑定，之后在微信里打开 " +
		hostOf(s.Config.RPOrigin) + "/m 即可一键登录（7 天内有效）：\n" + link
	_, err = inst.Send(context.Background(), provider.OutboundMessage{Recipient: ilinkUserID, Text: text})
	if _, queued := provider.AsQueued(err); queued || err == nil {
		slog.Info("offered identity binding", "bot", botID, "queued", queued)
		return
	}
	slog.Warn("offer identity binding: send failed", "bot", botID, "err", err)
}

func hostOf(origin string) string {
	return strings.TrimPrefix(strings.TrimPrefix(strings.TrimRight(origin, "/"), "https://"), "http://")
}

type mobileLink struct{ Label, Href string }

type mobilePage struct {
	Title, Message string
	Links          []mobileLink
}

var mobilePageTmpl = template.Must(template.New("m").Parse(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{.Title}} · Hi微连</title><link rel="icon" href="/favicon.svg">
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#151916;font-family:"Geist","PingFang SC","Hiragino Sans GB",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:400px;margin:0 auto;padding:16vh 24px 40px;text-align:center}
.mark{width:48px;height:48px;border-radius:12px}
h2{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:22px 0 8px}
p{color:#6b736d;line-height:1.7;font-size:15px;margin:0}
.btn{display:block;margin:20px auto 0;max-width:280px;height:46px;line-height:46px;border-radius:10px;background:#151916;color:#fff;text-decoration:none;font-weight:500;font-size:15px}
.btn+.btn{margin-top:10px;background:#fff;color:#151916;border:1px solid #e3e6e3}
.foot{margin-top:56px;color:#9aa19c;font-size:12px}
</style></head>
<body><div class="wrap">
<img class="mark" src="/favicon.svg" alt="Hi微连">
<h2>{{.Title}}</h2>
<p>{{.Message}}</p>
{{range .Links}}<a class="btn" href="{{.Href}}">{{.Label}}</a>{{end}}
<p class="foot">Hi微连</p>
</div></body></html>`))

func renderMobilePage(w http.ResponseWriter, status int, p mobilePage) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	mobilePageTmpl.Execute(w, p)
}
