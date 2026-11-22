// Package wechatmp implements 微信服务号网页授权 (official-account web OAuth):
// https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_webpage_authorization.html
//
// Flow: AuthorizeURL → user consents in WeChat → redirect with ?code →
// Exchange(code) → (snsapi_userinfo) UserInfo.
package wechatmp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// Scopes.
const (
	ScopeBase     = "snsapi_base"     // silent, openid (+unionid) only
	ScopeUserInfo = "snsapi_userinfo" // consent page, adds nickname/avatar
)

// Endpoints, overridable in tests.
var (
	AuthorizeBase = "https://open.weixin.qq.com/connect/oauth2/authorize"
	APIBase       = "https://api.weixin.qq.com"
)

// Client is a 服务号 web-OAuth client.
type Client struct {
	AppID     string
	AppSecret string
	HTTP      *http.Client
}

// APIError is a WeChat {"errcode":…,"errmsg":…} response.
type APIError struct {
	ErrCode int    `json:"errcode"`
	ErrMsg  string `json:"errmsg"`
}

func (e *APIError) Error() string { return fmt.Sprintf("wechat api error %d: %s", e.ErrCode, e.ErrMsg) }

// AuthorizeURL returns the URL to open inside WeChat. state must be ≤128
// bytes of [a-zA-Z0-9]. redirectURI's domain must be registered as the
// 网页授权域名 of the 服务号.
func (c *Client) AuthorizeURL(redirectURI, scope, state string) string {
	// WeChat requires this parameter order; url.Values.Encode sorts keys.
	return fmt.Sprintf("%s?appid=%s&redirect_uri=%s&response_type=code&scope=%s&state=%s#wechat_redirect",
		AuthorizeBase, url.QueryEscape(c.AppID), url.QueryEscape(redirectURI), url.QueryEscape(scope), url.QueryEscape(state))
}

// Token is the result of exchanging a code.
type Token struct {
	AccessToken  string `json:"access_token"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	OpenID       string `json:"openid"`
	Scope        string `json:"scope"`
	UnionID      string `json:"unionid"`
	// IsSnapshotUser is 1 when the user is browsing in 快照页 mode (has not
	// really authorised); openid is a virtual value and must not be used.
	IsSnapshotUser int `json:"is_snapshotuser"`
}

// UserInfo is returned by /sns/userinfo (snsapi_userinfo only).
type UserInfo struct {
	OpenID     string `json:"openid"`
	Nickname   string `json:"nickname"`
	HeadImgURL string `json:"headimgurl"`
	UnionID    string `json:"unionid"`
}

// ErrSnapshotUser is returned by Exchange for 快照页 virtual users.
var ErrSnapshotUser = errors.New("wechat: snapshot-mode user (tap 使用完整服务 and retry)")

// Exchange trades an authorization code for a token.
func (c *Client) Exchange(ctx context.Context, code string) (*Token, error) {
	v := url.Values{"appid": {c.AppID}, "secret": {c.AppSecret}, "code": {code}, "grant_type": {"authorization_code"}}
	var t Token
	if err := c.get(ctx, "/sns/oauth2/access_token?"+v.Encode(), &t); err != nil {
		return nil, err
	}
	if t.IsSnapshotUser == 1 {
		return nil, ErrSnapshotUser
	}
	if t.OpenID == "" {
		return nil, errors.New("wechat: token response without openid")
	}
	return &t, nil
}

// UserInfo fetches the profile for a snsapi_userinfo token.
func (c *Client) UserInfo(ctx context.Context, t *Token) (*UserInfo, error) {
	v := url.Values{"access_token": {t.AccessToken}, "openid": {t.OpenID}, "lang": {"zh_CN"}}
	var u UserInfo
	if err := c.get(ctx, "/sns/userinfo?"+v.Encode(), &u); err != nil {
		return nil, err
	}
	return &u, nil
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	hc := c.HTTP
	if hc == nil {
		hc = &http.Client{Timeout: 10 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, APIBase+path, nil)
	if err != nil {
		return err
	}
	resp, err := hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("wechat: http %d", resp.StatusCode)
	}
	var ae APIError
	if json.Unmarshal(body, &ae) == nil && ae.ErrCode != 0 {
		return &ae
	}
	return json.Unmarshal(body, out)
}
