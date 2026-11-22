package memstore

import (
	"time"

	"github.com/openilink/openilink-hub/internal/store"
)

func (s *Store) UpsertWeChatIdentity(id *store.WeChatIdentity) error {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.identities == nil {
		q.identities = map[string]*store.WeChatIdentity{}
	}
	now := time.Now().Unix()
	k := qkey(id.BotID, id.ILinkUserID)
	cp := *id
	cp.UpdatedAt = now
	if old := q.identities[k]; old != nil {
		cp.CreatedAt = old.CreatedAt
	} else {
		cp.CreatedAt = now
	}
	q.identities[k] = &cp
	return nil
}

func (s *Store) GetWeChatIdentity(botID, ilinkUserID string) (*store.WeChatIdentity, error) {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	if id := q.identities[qkey(botID, ilinkUserID)]; id != nil {
		cp := *id
		return &cp, nil
	}
	return nil, nil
}

func (s *Store) ListWeChatIdentities(botID string) (map[string]*store.WeChatIdentity, error) {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	out := map[string]*store.WeChatIdentity{}
	for _, id := range q.identities {
		if id.BotID == botID {
			cp := *id
			out[id.ILinkUserID] = &cp
		}
	}
	return out, nil
}

func (s *Store) DeleteWeChatIdentity(botID, ilinkUserID string) error {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	delete(q.identities, qkey(botID, ilinkUserID))
	return nil
}
