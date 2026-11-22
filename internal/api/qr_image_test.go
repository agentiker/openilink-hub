package api

import (
	"image/png"
	"net/http"
	"net/url"
	"testing"
)

func TestQRImage(t *testing.T) {
	env := setupTestEnv(t)

	good := "https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=abc&bot_type=3"
	resp, err := http.Get(env.ts.URL + "/api/qr.png?size=300&text=" + url.QueryEscape(good))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "image/png" {
		t.Fatalf("want png 200, got %d %s", resp.StatusCode, resp.Header.Get("Content-Type"))
	}
	img, err := png.Decode(resp.Body)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if b := img.Bounds(); b.Dx() < 128 || b.Dx() != b.Dy() {
		t.Fatalf("unexpected size %v", b)
	}

	for _, bad := range []string{"", "http://liteapp.weixin.qq.com/x", "https://evil.com/?weixin.qq.com", "https://weixin.qq.com.evil.com/"} {
		r, err := http.Get(env.ts.URL + "/api/qr.png?text=" + url.QueryEscape(bad))
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		if r.StatusCode != http.StatusBadRequest {
			t.Errorf("%q: want 400, got %d", bad, r.StatusCode)
		}
	}
}
