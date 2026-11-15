package storetest

import (
	"bytes"
	"testing"

	"github.com/openilink/openilink-hub/internal/store"
)

func TestSendQuota(t *testing.T, s store.Store) {
	u := mustCreateUser(t, s, "quotaowner", "Quota Owner")
	b := mustCreateBot(t, s, u.ID, "QuotaBot")

	t.Run("Counter", func(t *testing.T) {
		q, err := s.GetSendQuota(b.ID, "alice")
		if err != nil || q.Used != 0 || q.ResetAt != 0 {
			t.Fatalf("unseen = %+v, %v", q, err)
		}
		if err := s.AddSendQuotaUsed(b.ID, "alice", 3); err != nil {
			t.Fatal(err)
		}
		s.AddSendQuotaUsed(b.ID, "alice", 2)
		if q, _ := s.GetSendQuota(b.ID, "alice"); q.Used != 5 {
			t.Errorf("used = %d, want 5", q.Used)
		}
		if err := s.ResetSendQuota(b.ID, "alice"); err != nil {
			t.Fatal(err)
		}
		q, _ = s.GetSendQuota(b.ID, "alice")
		if q.Used != 0 || q.ResetAt == 0 {
			t.Errorf("after reset = %+v", q)
		}
		s.SetSendQuotaUsed(b.ID, "alice", 10)
		if q, _ := s.GetSendQuota(b.ID, "alice"); q.Used != 10 {
			t.Errorf("after set = %d", q.Used)
		}
		s.AddSendQuotaUsed(b.ID, "bob", 1)
		list, err := s.ListSendQuotas(b.ID)
		if err != nil || len(list) != 2 {
			t.Errorf("list = %+v, %v", list, err)
		}
	})

	t.Run("Outbox", func(t *testing.T) {
		data := []byte{0x89, 'P', 'N', 'G', 0x00, 0xff}
		id1, err := s.EnqueueOutbox(&store.OutboxItem{BotID: b.ID, Recipient: "alice", Text: "first"})
		if err != nil || id1 == 0 {
			t.Fatalf("enqueue: %d %v", id1, err)
		}
		id2, _ := s.EnqueueOutbox(&store.OutboxItem{BotID: b.ID, Recipient: "alice", FileName: "a.png", Data: data, Text: "cap"})
		s.EnqueueOutbox(&store.OutboxItem{BotID: b.ID, Recipient: "bob", Text: "for bob", CreatedAt: 1})

		items, err := s.ListOutbox(b.ID, "alice", 10)
		if err != nil || len(items) != 2 {
			t.Fatalf("list = %d, %v", len(items), err)
		}
		if items[0].ID != id1 || items[0].Text != "first" || items[1].ID != id2 {
			t.Errorf("order/content: %+v", items)
		}
		if !bytes.Equal(items[1].Data, data) || items[1].FileName != "a.png" || items[1].CreatedAt == 0 {
			t.Errorf("media item = %+v", items[1])
		}
		if n, _ := s.CountOutbox(b.ID, "alice"); n != 2 {
			t.Errorf("count = %d", n)
		}
		by, _ := s.CountOutboxByRecipient(b.ID)
		if by["alice"] != 2 || by["bob"] != 1 {
			t.Errorf("by recipient = %v", by)
		}
		if one, _ := s.ListOutbox(b.ID, "alice", 1); len(one) != 1 || one[0].ID != id1 {
			t.Errorf("limit 1 = %+v", one)
		}

		if err := s.DeleteOutbox([]int64{id1}); err != nil {
			t.Fatal(err)
		}
		if n, _ := s.CountOutbox(b.ID, "alice"); n != 1 {
			t.Errorf("after delete = %d", n)
		}
		s.DeleteOutbox(nil)

		pruned, err := s.PruneOutbox(2) // bob's item has created_at=1
		if err != nil || pruned != 1 {
			t.Errorf("pruned = %d, %v", pruned, err)
		}
		if n, _ := s.CountOutbox(b.ID, "bob"); n != 0 {
			t.Errorf("bob after prune = %d", n)
		}
	})
}
