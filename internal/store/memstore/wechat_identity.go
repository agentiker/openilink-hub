package memstore

import (
	"errors"
	"sort"
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

func (s *Store) CreateWeChatBindLink(l *store.WeChatBindLink) error {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.bindLinks == nil {
		q.bindLinks = map[string]*store.WeChatBindLink{}
	}
	if _, ok := q.bindLinks[l.Code]; ok {
		return errors.New("bind link code exists")
	}
	if l.CreatedAt == 0 {
		l.CreatedAt = time.Now().Unix()
	}
	cp := *l
	q.bindLinks[l.Code] = &cp
	return nil
}

func (s *Store) GetWeChatBindLink(code string) (*store.WeChatBindLink, error) {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	if l := q.bindLinks[code]; l != nil {
		cp := *l
		return &cp, nil
	}
	return nil, nil
}

func (s *Store) PruneWeChatBindLinks(before int64) error {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	for k, l := range q.bindLinks {
		if l.ExpiresAt < before {
			delete(q.bindLinks, k)
		}
	}
	return nil
}

func (s *Store) FindWeChatIdentities(appID, openID, unionID string) ([]store.WeChatIdentity, error) {
	q := s.qs()
	q.mu.Lock()
	defer q.mu.Unlock()
	var out []store.WeChatIdentity
	for _, id := range q.identities {
		if (id.AppID == appID && id.OpenID == openID) || (unionID != "" && id.UnionID == unionID) {
			out = append(out, *id)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out, nil
}
