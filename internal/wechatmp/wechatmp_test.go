package wechatmp

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAuthorizeURL(t *testing.T) {
	c := &Client{AppID: "wx123"}
	u := c.AuthorizeURL("https://hub.example.com/wx/bind/callback", ScopeUserInfo, "abc123")
	want := "https://open.weixin.qq.com/connect/oauth2/authorize?appid=wx123&redirect_uri=https%3A%2F%2Fhub.example.com%2Fwx%2Fbind%2Fcallback&response_type=code&scope=snsapi_userinfo&state=abc123#wechat_redirect"
	if u != want {
		t.Errorf("got  %s\nwant %s", u, want)
	}
}

func fake(t *testing.T, routes map[string]string) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, ok := routes[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path == "/sns/oauth2/access_token" && (r.URL.Query().Get("secret") != "sec" || r.URL.Query().Get("code") == "") {
			body = `{"errcode":40029,"errmsg":"invalid code"}`
		}
		w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	old := APIBase
	APIBase = srv.URL
	t.Cleanup(func() { APIBase = old })
}

func TestExchangeAndUserInfo(t *testing.T) {
	fake(t, map[string]string{
		"/sns/oauth2/access_token": `{"access_token":"at","expires_in":7200,"openid":"o1","scope":"snsapi_userinfo","unionid":"un1"}`,
		"/sns/userinfo":            `{"openid":"o1","nickname":"张三","headimgurl":"https://thirdwx.qlogo.cn/x/132","unionid":"un1"}`,
	})
	c := &Client{AppID: "wx", AppSecret: "sec"}
	tok, err := c.Exchange(context.Background(), "code1")
	if err != nil || tok.OpenID != "o1" || tok.UnionID != "un1" {
		t.Fatalf("exchange = %+v %v", tok, err)
	}
	u, err := c.UserInfo(context.Background(), tok)
	if err != nil || u.Nickname != "张三" || !strings.HasPrefix(u.HeadImgURL, "https://") {
		t.Fatalf("userinfo = %+v %v", u, err)
	}
}

func TestExchangeErrors(t *testing.T) {
	fake(t, map[string]string{"/sns/oauth2/access_token": `{"openid":"o1"}`})
	c := &Client{AppID: "wx", AppSecret: "wrong"}
	var ae *APIError
	if _, err := c.Exchange(context.Background(), "c"); !errors.As(err, &ae) || ae.ErrCode != 40029 {
		t.Errorf("bad secret: %v", err)
	}

	fake(t, map[string]string{"/sns/oauth2/access_token": `{"access_token":"at","openid":"virtual","is_snapshotuser":1}`})
	c.AppSecret = "sec"
	if _, err := c.Exchange(context.Background(), "c"); !errors.Is(err, ErrSnapshotUser) {
		t.Errorf("snapshot: %v", err)
	}
}
