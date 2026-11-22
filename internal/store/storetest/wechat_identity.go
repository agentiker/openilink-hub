package storetest

import (
	"testing"

	"github.com/openilink/openilink-hub/internal/store"
)

func TestWeChatIdentity(t *testing.T, s store.Store) {
	u := mustCreateUser(t, s, "wxidowner", "WX Owner")
	b := mustCreateBot(t, s, u.ID, "WXBot")
	other := mustCreateBot(t, s, u.ID, "OtherBot")

	if got, err := s.GetWeChatIdentity(b.ID, "u1@im.wechat"); err != nil || got != nil {
		t.Fatalf("missing: %+v %v", got, err)
	}
	in := &store.WeChatIdentity{BotID: b.ID, ILinkUserID: "u1@im.wechat", AppID: "wxapp", OpenID: "o1", UnionID: "un1", Nickname: "张三", AvatarURL: "https://a/1"}
	if err := s.UpsertWeChatIdentity(in); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetWeChatIdentity(b.ID, "u1@im.wechat")
	if err != nil || got == nil || got.Nickname != "张三" || got.OpenID != "o1" || got.UnionID != "un1" || got.CreatedAt == 0 {
		t.Fatalf("get = %+v %v", got, err)
	}
	created := got.CreatedAt

	in.Nickname = "张三丰"
	s.UpsertWeChatIdentity(in)
	got, _ = s.GetWeChatIdentity(b.ID, "u1@im.wechat")
	if got.Nickname != "张三丰" || got.CreatedAt != created {
		t.Errorf("after update = %+v", got)
	}

	// Scoped per bot.
	if g, _ := s.GetWeChatIdentity(other.ID, "u1@im.wechat"); g != nil {
		t.Error("identity leaked to another bot")
	}
	s.UpsertWeChatIdentity(&store.WeChatIdentity{BotID: b.ID, ILinkUserID: "u2@im.wechat", OpenID: "o2"})
	all, err := s.ListWeChatIdentities(b.ID)
	if err != nil || len(all) != 2 || all["u2@im.wechat"].OpenID != "o2" {
		t.Errorf("list = %v %v", all, err)
	}
	if err := s.DeleteWeChatIdentity(b.ID, "u2@im.wechat"); err != nil {
		t.Fatal(err)
	}
	if all, _ := s.ListWeChatIdentities(b.ID); len(all) != 1 {
		t.Errorf("after delete = %d", len(all))
	}
}
