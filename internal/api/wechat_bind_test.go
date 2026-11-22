package api

import (
	"strings"
	"testing"
	"time"

	"github.com/openilink/openilink-hub/internal/config"
)

func TestBindToken(t *testing.T) {
	s := &Server{Config: &config.Config{Secret: "s1"}}
	tok := s.signBindToken(bindClaims{BotID: "b", ILinkUserID: "u@im.wechat", Exp: time.Now().Add(time.Hour).Unix()})
	c, err := s.verifyBindToken(tok)
	if err != nil || c.BotID != "b" || c.ILinkUserID != "u@im.wechat" {
		t.Fatalf("verify = %+v %v", c, err)
	}

	other := &Server{Config: &config.Config{Secret: "s2"}}
	if _, err := other.verifyBindToken(tok); err == nil {
		t.Error("token must not verify under another secret")
	}
	p, sig, _ := strings.Cut(tok, ".")
	if _, err := s.verifyBindToken(p + "x." + sig); err == nil {
		t.Error("tampered payload accepted")
	}
	expired := s.signBindToken(bindClaims{BotID: "b", ILinkUserID: "u", Exp: time.Now().Add(-time.Second).Unix()})
	if _, err := s.verifyBindToken(expired); err == nil {
		t.Error("expired token accepted")
	}
	for _, bad := range []string{"", "abc", "a.b"} {
		if _, err := s.verifyBindToken(bad); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
}

func TestWxStateStore(t *testing.T) {
	st := &wxStateStore{m: map[string]wxState{}}
	k := st.put(bindClaims{BotID: "b"})
	if len(k) != 32 {
		t.Errorf("state len = %d (WeChat allows ≤128)", len(k))
	}
	if c, ok := st.take(k); !ok || c.BotID != "b" {
		t.Fatal("take failed")
	}
	if _, ok := st.take(k); ok {
		t.Error("state must be single-use")
	}
}

func TestValidVerifyFile(t *testing.T) {
	for name, want := range map[string]bool{
		"MP_verify_AbC123.txt": true, "MP_verify_.txt": false, "MP_verify_a/b.txt": false,
		"verify_abc.txt": false, "MP_verify_abc.html": false, "MP_verify_../x.txt": false,
	} {
		if got := validVerifyFile(name); got != want {
			t.Errorf("%s = %v, want %v", name, got, want)
		}
	}
	if c := (wechatMPConfig{VerifyFile: "MP_verify_AbC123.txt"}).verifyContent(); c != "AbC123" {
		t.Errorf("content = %q", c)
	}
}

func TestBindCode(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 2000; i++ {
		c := newBindCode()
		if !validBindCode(c) {
			t.Fatalf("generated invalid code %q", c)
		}
		if seen[c] {
			t.Fatalf("duplicate code %q", c)
		}
		seen[c] = true
	}
	for _, bad := range []string{"", "short", "Ab3xK9mQ2zz", "Ab3xK9mQ2O", "Ab3xK9mQ/z", "../etc/pas"} {
		if validBindCode(bad) {
			t.Errorf("%q accepted", bad)
		}
	}
}
