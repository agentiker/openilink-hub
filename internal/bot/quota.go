package bot

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/agentiker/wxilink-sdk-go/quota"
	"github.com/openilink/openilink-hub/internal/provider"
	"github.com/openilink/openilink-hub/internal/store"
)

// Outbox limits.
const (
	outboxMaxPerRecipient = 100
	outboxMaxItemBytes    = 20 << 20
	outboxTTL             = 7 * 24 * time.Hour
	digestMaxRunes        = 1800
)

// errFlushStop ends a flush: the allowance is used up again.
var errFlushStop = errors.New("flush: allowance used up")

// QuotaProvider wraps a provider whose upstream allows only a fixed number
// of messages per inbound user message (iLink: 10, resetting — not
// accumulating — on every inbound message). For every send path in the Hub
// it:
//
//   - counts sends per recipient (store.SendQuota), reset on inbound;
//   - appends a "reply to keep receiving" nudge to the last allowed message,
//     so recipients are never left wondering why notifications stopped;
//   - queues messages beyond the allowance (store.OutboxItem) and returns
//     *provider.QueuedError instead of failing;
//   - when the recipient writes again, delivers the queue, merging text
//     items into digests if they don't fit the fresh allowance.
//
// The upstream remains authoritative: a no-session refusal (sends made
// outside the Hub also consume the allowance) marks the allowance used up
// and queues the message.
type QuotaProvider struct {
	provider.Provider
	store       store.Store
	botID       string
	limit       int
	onDelivered func(recipient string, msg provider.OutboundMessage) // record flushed messages

	mu sync.Mutex // serialises allowance decisions for this bot
}

// NewQuotaProvider wraps p. limit is the per-inbound allowance.
func NewQuotaProvider(p provider.Provider, s store.Store, botID string, limit int,
	onDelivered func(recipient string, msg provider.OutboundMessage)) *QuotaProvider {
	return &QuotaProvider{Provider: p, store: s, botID: botID, limit: limit, onDelivered: onDelivered}
}

// Unwrap returns the wrapped provider.
func (q *QuotaProvider) Unwrap() provider.Provider { return q.Provider }

// DefaultRecipient implements provider.DefaultRecipienter for the wrapped provider.
func (q *QuotaProvider) DefaultRecipient() string { return q.recipient("") }

// Limit returns the per-inbound allowance.
func (q *QuotaProvider) Limit() int { return q.limit }

func (q *QuotaProvider) recipient(r string) string {
	if r != "" {
		return r
	}
	if d, ok := q.Provider.(provider.DefaultRecipienter); ok {
		return d.DefaultRecipient()
	}
	return r
}

// Send implements provider.Provider with allowance accounting.
func (q *QuotaProvider) Send(ctx context.Context, msg provider.OutboundMessage) (string, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	msg.Recipient = q.recipient(msg.Recipient)
	pending, err := q.store.CountOutbox(q.botID, msg.Recipient)
	if err != nil {
		return "", err
	}
	return q.sendLocked(ctx, msg, false, pending)
}

func isMedia(msg provider.OutboundMessage) bool { return len(msg.Data) > 0 && msg.FileName != "" }

// sendLocked sends one message within the allowance. pendingAfter is how
// many queued messages remain after this one (for the nudge text).
//
// fromFlush=false: over-allowance messages are queued (*QueuedError).
// fromFlush=true: the message already sits in the outbox; over-allowance
// returns errFlushStop and nothing is re-queued.
func (q *QuotaProvider) sendLocked(ctx context.Context, msg provider.OutboundMessage, fromFlush bool, pendingAfter int) (string, error) {
	rec := msg.Recipient
	row, err := q.store.GetSendQuota(q.botID, rec)
	if err != nil {
		return "", err
	}
	remaining := q.limit - row.Used
	media := isMedia(msg)
	original := msg

	if remaining <= 0 {
		if fromFlush {
			return "", errFlushStop
		}
		return q.enqueue(original, pendingAfter)
	}

	if remaining == 1 && media {
		// Only one message left: spend it on telling the recipient a file is
		// waiting, keep the file for after their reply.
		waiting := pendingAfter + 1
		var qerr error
		if !fromFlush {
			var qe *provider.QueuedError
			_, qerr = q.enqueue(original, pendingAfter)
			if !errors.As(qerr, &qe) {
				return "", qerr
			}
		}
		if _, err := q.Provider.Send(ctx, provider.OutboundMessage{Recipient: rec, Text: quota.Nudge(waiting)}); err == nil {
			q.store.AddSendQuotaUsed(q.botID, rec, 1)
		} else if kind, _ := provider.SendErrorKindOf(err); kind == provider.SendErrNoSession {
			q.store.SetSendQuotaUsed(q.botID, rec, q.limit)
		}
		if fromFlush {
			return "", errFlushStop
		}
		return "", qerr
	}

	cost := quota.Cost(media, msg.Text != "")
	if remaining-cost <= 0 {
		// This message exhausts the allowance: it carries the nudge.
		msg.Text = quota.WithNudge(msg.Text, pendingAfter)
		cost = quota.Cost(media, true)
	}

	id, err := q.Provider.Send(ctx, msg)
	if err == nil {
		if aerr := q.store.AddSendQuotaUsed(q.botID, rec, cost); aerr != nil {
			slog.Error("quota: add used failed", "bot", q.botID, "err", aerr)
		}
		return id, nil
	}
	if kind, _ := provider.SendErrorKindOf(err); kind == provider.SendErrNoSession {
		// Upstream says the allowance is gone (or the user never wrote).
		q.store.SetSendQuotaUsed(q.botID, rec, q.limit)
		if fromFlush {
			return "", errFlushStop
		}
		return q.enqueue(original, pendingAfter)
	}
	return id, err
}

func (q *QuotaProvider) enqueue(msg provider.OutboundMessage, pendingBefore int) (string, error) {
	if pendingBefore >= outboxMaxPerRecipient {
		return "", &provider.SendError{Kind: provider.SendErrNoSession, Msg: fmt.Sprintf("outbox full (%d pending)", pendingBefore)}
	}
	if len(msg.Data) > outboxMaxItemBytes {
		return "", &provider.SendError{Kind: provider.SendErrNoSession, Msg: "file too large to queue"}
	}
	id, err := q.store.EnqueueOutbox(&store.OutboxItem{
		BotID: q.botID, Recipient: msg.Recipient, Text: msg.Text, FileName: msg.FileName, Data: msg.Data,
	})
	if err != nil {
		return "", err
	}
	slog.Info("quota: queued", "bot", q.botID, "recipient", msg.Recipient, "pending", pendingBefore+1)
	return "", &provider.QueuedError{ID: id, Pending: pendingBefore + 1}
}

// OnInbound resets the allowance for sender. Call it synchronously before
// replying to the inbound message, then call Flush (may be async).
func (q *QuotaProvider) OnInbound(sender string) {
	if sender == "" {
		return
	}
	q.mu.Lock()
	defer q.mu.Unlock()
	if err := q.store.ResetSendQuota(q.botID, sender); err != nil {
		slog.Error("quota: reset failed", "bot", q.botID, "err", err)
	}
}

// Flush delivers queued messages for recipient within the current
// allowance. Returns the number of queued items delivered.
func (q *QuotaProvider) Flush(ctx context.Context, recipient string) int {
	q.mu.Lock()
	defer q.mu.Unlock()

	total, err := q.store.CountOutbox(q.botID, recipient)
	if err != nil || total == 0 {
		return 0
	}
	items, err := q.store.ListOutbox(q.botID, recipient, outboxMaxPerRecipient)
	if err != nil {
		slog.Error("quota: list outbox failed", "bot", q.botID, "err", err)
		return 0
	}
	row, _ := q.store.GetSendQuota(q.botID, recipient)
	remaining := q.limit - row.Used
	plan := planFlush(items, remaining)

	left := total
	delivered := 0
	for _, p := range plan {
		after := left - len(p.ids)
		_, err := q.sendLocked(ctx, p.msg, true, after)
		if err != nil {
			if !errors.Is(err, errFlushStop) {
				slog.Error("quota: flush send failed", "bot", q.botID, "recipient", recipient, "err", err)
			}
			break
		}
		if err := q.store.DeleteOutbox(p.ids); err != nil {
			slog.Error("quota: delete outbox failed", "bot", q.botID, "err", err)
		}
		if q.onDelivered != nil {
			q.onDelivered(recipient, p.msg)
		}
		left = after
		delivered += len(p.ids)
	}
	if delivered > 0 {
		slog.Info("quota: flushed", "bot", q.botID, "recipient", recipient, "delivered", delivered, "left", left)
	}
	return delivered
}

type plannedMsg struct {
	msg provider.OutboundMessage
	ids []int64
}

// planFlush turns queued items into messages. If they fit the allowance
// they are sent one by one; otherwise consecutive text items are merged
// into digests (up to digestMaxRunes each) to save allowance. Media items
// are always sent individually, in order.
func planFlush(items []store.OutboxItem, remaining int) []plannedMsg {
	toMsg := func(it store.OutboxItem) provider.OutboundMessage {
		return provider.OutboundMessage{Recipient: it.Recipient, Text: it.Text, FileName: it.FileName, Data: it.Data}
	}
	cost := 0
	for _, it := range items {
		cost += quota.Cost(len(it.Data) > 0 && it.FileName != "", it.Text != "")
	}
	var out []plannedMsg
	if cost <= remaining {
		for _, it := range items {
			out = append(out, plannedMsg{msg: toMsg(it), ids: []int64{it.ID}})
		}
		return out
	}

	var run []store.OutboxItem
	flushRun := func() {
		if len(run) == 0 {
			return
		}
		if len(run) == 1 {
			out = append(out, plannedMsg{msg: toMsg(run[0]), ids: []int64{run[0].ID}})
			run = nil
			return
		}
		var b strings.Builder
		var ids []int64
		n := 0
		emit := func() {
			if len(ids) == 0 {
				return
			}
			header := fmt.Sprintf("📬 未读通知（%d 条）：\n\n", n)
			out = append(out, plannedMsg{
				msg: provider.OutboundMessage{Recipient: run[0].Recipient, Text: header + strings.TrimRight(b.String(), "\n")},
				ids: ids,
			})
			b.Reset()
			ids, n = nil, 0
		}
		for _, it := range run {
			entry := fmt.Sprintf("%s %s\n\n", time.Unix(it.CreatedAt, 0).Format("01-02 15:04"), it.Text)
			if n > 0 && len([]rune(b.String()))+len([]rune(entry)) > digestMaxRunes {
				emit()
			}
			b.WriteString(entry)
			ids = append(ids, it.ID)
			n++
		}
		emit()
		run = nil
	}
	for _, it := range items {
		if len(it.Data) > 0 && it.FileName != "" {
			flushRun()
			out = append(out, plannedMsg{msg: toMsg(it), ids: []int64{it.ID}})
			continue
		}
		run = append(run, it)
	}
	flushRun()
	return out
}

// mediaItemType guesses the message item type from a file name.
func mediaItemType(fileName string) string {
	switch strings.ToLower(filepath.Ext(fileName)) {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp":
		return "image"
	case ".mp4", ".mov", ".avi", ".mkv", ".webm":
		return "video"
	case ".wav", ".mp3", ".silk", ".amr", ".ogg", ".m4a":
		return "voice"
	}
	return "file"
}

// QuotaStatus describes one recipient's allowance.
type QuotaStatus struct {
	Recipient string `json:"recipient"`
	Limit     int    `json:"limit"`
	Used      int    `json:"used"`
	Remaining int    `json:"remaining"`
	Pending   int    `json:"pending"`  // queued messages
	ResetAt   int64  `json:"reset_at"` // unix seconds of last inbound, 0 if never seen
}

// QuotaStatus returns the allowance for recipient ("" = default recipient).
func (q *QuotaProvider) QuotaStatus(recipient string) (QuotaStatus, error) {
	recipient = q.recipient(recipient)
	row, err := q.store.GetSendQuota(q.botID, recipient)
	if err != nil {
		return QuotaStatus{}, err
	}
	pending, err := q.store.CountOutbox(q.botID, recipient)
	if err != nil {
		return QuotaStatus{}, err
	}
	return q.status(recipient, row.Used, row.ResetAt, pending), nil
}

// QuotaStatusAll returns the allowance of every recipient with a counter or
// queued messages, plus the default recipient.
func (q *QuotaProvider) QuotaStatusAll() ([]QuotaStatus, error) {
	rows, err := q.store.ListSendQuotas(q.botID)
	if err != nil {
		return nil, err
	}
	pending, err := q.store.CountOutboxByRecipient(q.botID)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var out []QuotaStatus
	for _, r := range rows {
		seen[r.Recipient] = true
		out = append(out, q.status(r.Recipient, r.Used, r.ResetAt, pending[r.Recipient]))
	}
	for rec, n := range pending {
		if !seen[rec] {
			seen[rec] = true
			out = append(out, q.status(rec, 0, 0, n))
		}
	}
	if def := q.recipient(""); def != "" && !seen[def] {
		out = append(out, q.status(def, 0, 0, 0))
	}
	return out, nil
}

func (q *QuotaProvider) status(rec string, used int, resetAt int64, pending int) QuotaStatus {
	rem := q.limit - used
	if rem < 0 {
		rem = 0
	}
	return QuotaStatus{Recipient: rec, Limit: q.limit, Used: used, Remaining: rem, Pending: pending, ResetAt: resetAt}
}
