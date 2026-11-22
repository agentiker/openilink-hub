package memstore

import (
	"sort"
	"sync"
	"time"

	"github.com/openilink/openilink-hub/internal/store"
)

// quotaState holds send quota and outbox data, lazily created so New()
// needs no change.
type quotaState struct {
	mu     sync.Mutex
	quotas map[string]*store.SendQuota // "bot\x00recipient"
	outbox []store.OutboxItem
	seq    int64

	identities map[string]*store.WeChatIdentity // "bot\x00ilink_user_id"
	bindLinks  map[string]*store.WeChatBindLink
}

func (s *Store) qs() *quotaState {
	s.quotaOnce.Do(func() { s.quota = &quotaState{quotas: map[string]*store.SendQuota{}} })
	return s.quota
}

func qkey(botID, recipient string) string { return botID + "\x00" + recipient }

func (q *quotaState) row(botID, recipient string) *store.SendQuota {
	k := qkey(botID, recipient)
	r := q.quotas[k]
	if r == nil {
		r = &store.SendQuota{BotID: botID, Recipient: recipient}
		q.quotas[k] = r
	}
	return r
}

func (s *Store) GetSendQuota(botID, recipient string) (*store.SendQuota, error) {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	if r := q.quotas[qkey(botID, recipient)]; r != nil {
		cp := *r
		return &cp, nil
	}
	return &store.SendQuota{BotID: botID, Recipient: recipient}, nil
}

func (s *Store) ListSendQuotas(botID string) ([]store.SendQuota, error) {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	var out []store.SendQuota
	for _, r := range q.quotas {
		if r.BotID == botID {
			out = append(out, *r)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out, nil
}

func (s *Store) ResetSendQuota(botID, recipient string) error {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	r := q.row(botID, recipient)
	now := time.Now().Unix()
	r.Used, r.ResetAt, r.UpdatedAt = 0, now, now
	return nil
}

func (s *Store) AddSendQuotaUsed(botID, recipient string, n int) error {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	r := q.row(botID, recipient)
	r.Used += n
	r.UpdatedAt = time.Now().Unix()
	return nil
}

func (s *Store) SetSendQuotaUsed(botID, recipient string, used int) error {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	r := q.row(botID, recipient)
	r.Used = used
	r.UpdatedAt = time.Now().Unix()
	return nil
}

func (s *Store) EnqueueOutbox(item *store.OutboxItem) (int64, error) {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	q.seq++
	item.ID = q.seq
	if item.CreatedAt == 0 {
		item.CreatedAt = time.Now().Unix()
	}
	q.outbox = append(q.outbox, *item)
	return item.ID, nil
}

func (s *Store) ListOutbox(botID, recipient string, limit int) ([]store.OutboxItem, error) {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	if limit <= 0 {
		limit = 100
	}
	var out []store.OutboxItem
	for _, it := range q.outbox {
		if it.BotID == botID && it.Recipient == recipient {
			out = append(out, it)
			if len(out) == limit {
				break
			}
		}
	}
	return out, nil
}

func (s *Store) CountOutbox(botID, recipient string) (int, error) {
	items, _ := s.ListOutbox(botID, recipient, 1<<30)
	return len(items), nil
}

func (s *Store) CountOutboxByRecipient(botID string) (map[string]int, error) {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	out := map[string]int{}
	for _, it := range q.outbox {
		if it.BotID == botID {
			out[it.Recipient]++
		}
	}
	return out, nil
}

func (s *Store) DeleteOutbox(ids []int64) error {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	del := map[int64]bool{}
	for _, id := range ids {
		del[id] = true
	}
	kept := q.outbox[:0]
	for _, it := range q.outbox {
		if !del[it.ID] {
			kept = append(kept, it)
		}
	}
	q.outbox = kept
	return nil
}

func (s *Store) PruneOutbox(before int64) (int64, error) {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	var n int64
	kept := q.outbox[:0]
	for _, it := range q.outbox {
		if it.CreatedAt < before {
			n++
			continue
		}
		kept = append(kept, it)
	}
	q.outbox = kept
	return n, nil
}
