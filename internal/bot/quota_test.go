package bot

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/openilink/openilink-hub/internal/provider"
	"github.com/openilink/openilink-hub/internal/store"
	"github.com/openilink/openilink-hub/internal/store/memstore"
)

// quotaFakeProvider records sends; refuseAfter > 0 makes the upstream
// refuse (no session) once that many sends were accepted.
type quotaFakeProvider struct {
	provider.Provider
	mu          sync.Mutex
	sent        []provider.OutboundMessage
	refuseAfter int
	failWith    error
}

func (f *quotaFakeProvider) Send(_ context.Context, m provider.OutboundMessage) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failWith != nil {
		return "", f.failWith
	}
	cost := 1
	if len(m.Data) > 0 && m.FileName != "" && m.Text != "" {
		cost = 2
	}
	if f.refuseAfter > 0 && len(f.sent)+cost > f.refuseAfter {
		return "", &provider.SendError{Kind: provider.SendErrNoSession, Code: -2, Msg: "prepare failed"}
	}
	f.sent = append(f.sent, m)
	return fmt.Sprintf("c%d", len(f.sent)), nil
}
func (f *quotaFakeProvider) DefaultRecipient() string { return "owner" }
func (f *quotaFakeProvider) texts() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []string
	for _, m := range f.sent {
		if len(m.Data) > 0 {
			out = append(out, "<"+m.FileName+">"+m.Text)
		} else {
			out = append(out, m.Text)
		}
	}
	return out
}

type delivered struct {
	mu   sync.Mutex
	msgs []provider.OutboundMessage
}

func (d *delivered) add(_ string, m provider.OutboundMessage) {
	d.mu.Lock()
	d.msgs = append(d.msgs, m)
	d.mu.Unlock()
}

func newQuotaTest(t *testing.T) (*QuotaProvider, *quotaFakeProvider, *memstore.Store, *delivered) {
	t.Helper()
	st := memstore.New()
	fp := &quotaFakeProvider{}
	d := &delivered{}
	return NewQuotaProvider(fp, st, "bot1", 10, d.add), fp, st, d
}

func send(t *testing.T, q *QuotaProvider, to, text string) error {
	t.Helper()
	_, err := q.Send(context.Background(), provider.OutboundMessage{Recipient: to, Text: text})
	return err
}

func TestQuota_NudgeOnTenthThenQueue(t *testing.T) {
	q, fp, st, _ := newQuotaTest(t)
	for i := 1; i <= 10; i++ {
		if err := send(t, q, "alice", fmt.Sprintf("m%d", i)); err != nil {
			t.Fatalf("send %d: %v", i, err)
		}
	}
	got := fp.texts()
	for i, s := range got[:9] {
		if strings.Contains(s, "💬") {
			t.Errorf("message %d has nudge: %q", i+1, s)
		}
	}
	if !strings.HasPrefix(got[9], "m10\n\n💬") || !strings.Contains(got[9], "回复任意消息") {
		t.Errorf("10th = %q", got[9])
	}

	err := send(t, q, "alice", "m11")
	qe, ok := provider.AsQueued(err)
	if !ok || qe.Pending != 1 {
		t.Fatalf("11th: got %v, want queued pending=1", err)
	}
	if qe, _ := provider.AsQueued(send(t, q, "alice", "m12")); qe == nil || qe.Pending != 2 {
		t.Errorf("12th: want queued pending=2")
	}
	if len(fp.texts()) != 10 {
		t.Errorf("upstream got %d messages, want 10", len(fp.texts()))
	}
	if n, _ := st.CountOutbox("bot1", "alice"); n != 2 {
		t.Errorf("outbox = %d", n)
	}
	// Other recipients are unaffected.
	if err := send(t, q, "bob", "hi"); err != nil {
		t.Errorf("bob: %v", err)
	}
}

func TestQuota_FlushAfterInbound(t *testing.T) {
	q, fp, st, d := newQuotaTest(t)
	st.SetSendQuotaUsed("bot1", "alice", 10)
	send(t, q, "alice", "late1")
	send(t, q, "alice", "late2")
	if len(fp.texts()) != 0 {
		t.Fatal("nothing should be sent while exhausted")
	}

	q.OnInbound("alice")
	if n := q.Flush(context.Background(), "alice"); n != 2 {
		t.Fatalf("flushed %d, want 2", n)
	}
	got := fp.texts()
	if len(got) != 2 || got[0] != "late1" || got[1] != "late2" {
		t.Errorf("flushed = %q", got)
	}
	if n, _ := st.CountOutbox("bot1", "alice"); n != 0 {
		t.Errorf("outbox left = %d", n)
	}
	if len(d.msgs) != 2 {
		t.Errorf("onDelivered calls = %d", len(d.msgs))
	}
	if row, _ := st.GetSendQuota("bot1", "alice"); row.Used != 2 {
		t.Errorf("used = %d, want 2", row.Used)
	}
}

func TestQuota_FlushMergesTextIntoDigest(t *testing.T) {
	q, fp, st, _ := newQuotaTest(t)
	st.SetSendQuotaUsed("bot1", "alice", 10)
	for i := 1; i <= 15; i++ {
		send(t, q, "alice", fmt.Sprintf("alert %d", i))
	}
	q.OnInbound("alice")
	if n := q.Flush(context.Background(), "alice"); n != 15 {
		t.Fatalf("flushed %d, want 15", n)
	}
	got := fp.texts()
	if len(got) != 1 {
		t.Fatalf("sent %d messages, want 1 digest: %q", len(got), got)
	}
	if !strings.Contains(got[0], "未读通知（15 条）") || !strings.Contains(got[0], "alert 1\n") || !strings.Contains(got[0], "alert 15") {
		t.Errorf("digest = %q", got[0])
	}
}

func TestQuota_FlushTooManyMediaLeavesRestWithNudge(t *testing.T) {
	q, fp, st, _ := newQuotaTest(t)
	st.SetSendQuotaUsed("bot1", "alice", 10)
	for i := 1; i <= 12; i++ {
		q.Send(context.Background(), provider.OutboundMessage{Recipient: "alice", FileName: fmt.Sprintf("p%d.png", i), Data: []byte("x")})
	}
	q.OnInbound("alice")
	if n := q.Flush(context.Background(), "alice"); n != 9 {
		t.Fatalf("flushed %d, want 9", n)
	}
	got := fp.texts()
	if len(got) != 10 || !strings.Contains(got[9], "还有 3 条消息待接收") {
		t.Errorf("sent = %q", got)
	}
	if n, _ := st.CountOutbox("bot1", "alice"); n != 3 {
		t.Errorf("outbox left = %d, want 3", n)
	}
	// Next reply delivers the rest.
	q.OnInbound("alice")
	if n := q.Flush(context.Background(), "alice"); n != 3 {
		t.Errorf("second flush = %d, want 3", n)
	}
}

func TestQuota_MediaOnLastSlotIsQueuedWithNudge(t *testing.T) {
	q, fp, st, _ := newQuotaTest(t)
	st.SetSendQuotaUsed("bot1", "alice", 9)
	_, err := q.Send(context.Background(), provider.OutboundMessage{Recipient: "alice", FileName: "r.pdf", Data: []byte("%PDF")})
	if qe, ok := provider.AsQueued(err); !ok || qe.Pending != 1 {
		t.Fatalf("got %v, want queued", err)
	}
	got := fp.texts()
	if len(got) != 1 || !strings.Contains(got[0], "还有 1 条消息待接收") {
		t.Errorf("sent = %q, want only the nudge", got)
	}
	if row, _ := st.GetSendQuota("bot1", "alice"); row.Used != 10 {
		t.Errorf("used = %d", row.Used)
	}
}

func TestQuota_MediaWithCaptionOnLastTwoCarriesNudge(t *testing.T) {
	q, fp, st, _ := newQuotaTest(t)
	st.SetSendQuotaUsed("bot1", "alice", 8)
	_, err := q.Send(context.Background(), provider.OutboundMessage{Recipient: "alice", FileName: "r.pdf", Data: []byte("%PDF"), Text: "日报"})
	if err != nil {
		t.Fatal(err)
	}
	got := fp.texts()
	if len(got) != 1 || !strings.HasPrefix(got[0], "<r.pdf>日报\n\n💬") {
		t.Errorf("sent = %q", got)
	}
}

func TestQuota_UpstreamRefusalQueues(t *testing.T) {
	q, fp, st, _ := newQuotaTest(t)
	fp.refuseAfter = 3 // sends outside the Hub used the rest
	for i := 0; i < 3; i++ {
		if err := send(t, q, "alice", "ok"); err != nil {
			t.Fatal(err)
		}
	}
	err := send(t, q, "alice", "refused")
	if _, ok := provider.AsQueued(err); !ok {
		t.Fatalf("got %v, want queued", err)
	}
	if row, _ := st.GetSendQuota("bot1", "alice"); row.Used != 10 {
		t.Errorf("used = %d, want limit after refusal", row.Used)
	}
	items, _ := st.ListOutbox("bot1", "alice", 10)
	if len(items) != 1 || items[0].Text != "refused" {
		t.Errorf("outbox = %+v (queued text must be the original, without nudge)", items)
	}
}

func TestQuota_OtherErrorsPassThrough(t *testing.T) {
	q, fp, st, _ := newQuotaTest(t)
	boom := errors.New("network down")
	fp.failWith = boom
	if err := send(t, q, "alice", "x"); !errors.Is(err, boom) {
		t.Fatalf("got %v", err)
	}
	if n, _ := st.CountOutbox("bot1", "alice"); n != 0 {
		t.Error("transport errors must not queue")
	}
	if row, _ := st.GetSendQuota("bot1", "alice"); row.Used != 0 {
		t.Error("failed sends must not count")
	}
}

func TestQuota_DefaultRecipientAndStatus(t *testing.T) {
	q, fp, st, _ := newQuotaTest(t)
	send(t, q, "", "to owner")
	if fp.sent[0].Recipient != "owner" {
		t.Errorf("recipient = %q", fp.sent[0].Recipient)
	}
	if row, _ := st.GetSendQuota("bot1", "owner"); row.Used != 1 {
		t.Errorf("owner used = %d", row.Used)
	}
	st.EnqueueOutbox(queuedItem("bot1", "carol"))
	stat, _ := q.QuotaStatus("")
	if stat.Recipient != "owner" || stat.Remaining != 9 || stat.Limit != 10 {
		t.Errorf("status = %+v", stat)
	}
	all, _ := q.QuotaStatusAll()
	byRec := map[string]QuotaStatus{}
	for _, s := range all {
		byRec[s.Recipient] = s
	}
	if byRec["owner"].Remaining != 9 || byRec["carol"].Pending != 1 || byRec["carol"].Remaining != 10 {
		t.Errorf("all = %+v", all)
	}
}

func TestQuota_OutboxFull(t *testing.T) {
	q, _, st, _ := newQuotaTest(t)
	st.SetSendQuotaUsed("bot1", "alice", 10)
	for i := 0; i < outboxMaxPerRecipient; i++ {
		send(t, q, "alice", "x")
	}
	err := send(t, q, "alice", "overflow")
	if kind, ok := provider.SendErrorKindOf(err); !ok || kind != provider.SendErrNoSession {
		t.Fatalf("got %v, want SendError no_session", err)
	}
}

func TestMediaItemType(t *testing.T) {
	for name, want := range map[string]string{"a.PNG": "image", "b.mp4": "video", "c.wav": "voice", "d.pdf": "file", "e": "file"} {
		if got := mediaItemType(name); got != want {
			t.Errorf("%s = %s, want %s", name, got, want)
		}
	}
}

func queuedItem(botID, rec string) *store.OutboxItem {
	return &store.OutboxItem{BotID: botID, Recipient: rec, Text: "queued"}
}
