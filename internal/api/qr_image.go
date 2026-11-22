package api

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/url"
	"strconv"

	"rsc.io/qr"
)

// GET /api/qr.png?text=<url>&size=<px>
//
// Renders an iLink bind QR URL as a PNG so clients without a QR library
// (e.g. WeChat mini programs) can show it with a plain <image>. Only
// weixin.qq.com URLs are accepted, so this is not a general QR service.
func (s *Server) handleQRImage(w http.ResponseWriter, r *http.Request) {
	text := r.URL.Query().Get("text")
	if !isILinkQRURL(text) {
		jsonError(w, "unsupported qr text", http.StatusBadRequest)
		return
	}
	size := 480
	if v, err := strconv.Atoi(r.URL.Query().Get("size")); err == nil && v >= 128 && v <= 1024 {
		size = v
	}

	code, err := qr.Encode(text, qr.M)
	if err != nil {
		jsonError(w, "encode failed", http.StatusInternalServerError)
		return
	}

	const quiet = 2 // modules of white border
	modules := code.Size + quiet*2
	scale := size / modules
	if scale < 1 {
		scale = 1
	}
	dim := modules * scale
	img := image.NewGray(image.Rect(0, 0, dim, dim))
	for y := 0; y < dim; y++ {
		for x := 0; x < dim; x++ {
			mx, my := x/scale-quiet, y/scale-quiet
			c := color.Gray{Y: 0xff}
			if mx >= 0 && my >= 0 && mx < code.Size && my < code.Size && code.Black(mx, my) {
				c = color.Gray{Y: 0x00}
			}
			img.SetGray(x, y, c)
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		jsonError(w, "encode failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.Write(buf.Bytes())
}

func isILinkQRURL(s string) bool {
	if s == "" || len(s) > 1024 {
		return false
	}
	u, err := url.Parse(s)
	if err != nil || u.Scheme != "https" {
		return false
	}
	h := u.Hostname()
	return h == "weixin.qq.com" || len(h) > len(".weixin.qq.com") && h[len(h)-len(".weixin.qq.com"):] == ".weixin.qq.com"
}
