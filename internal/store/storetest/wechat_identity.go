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

	// Lookup by openid / unionid across bots.
	s.UpsertWeChatIdentity(&store.WeChatIdentity{BotID: other.ID, ILinkUserID: "u9@im.wechat", AppID: "wxapp", OpenID: "o9", UnionID: "un-shared"})
	if got, err := s.FindWeChatIdentities("wxapp", "o1", ""); err != nil || len(got) != 1 || got[0].BotID != b.ID {
		t.Errorf("find by openid = %+v %v", got, err)
	}
	if got, _ := s.FindWeChatIdentities("otherapp", "o1", ""); len(got) != 0 {
		t.Errorf("openid must be scoped to app_id, got %+v", got)
	}
	if got, _ := s.FindWeChatIdentities("x", "nope", "un-shared"); len(got) != 1 || got[0].OpenID != "o9" {
		t.Errorf("find by unionid = %+v", got)
	}
	if got, _ := s.FindWeChatIdentities("x", "nope", ""); len(got) != 0 {
		t.Errorf("empty unionid must not match, got %+v", got)
	}

	// Short bind links.
	if l, err := s.GetWeChatBindLink("nope"); err != nil || l != nil {
		t.Fatalf("unknown code: %+v %v", l, err)
	}
	link := &store.WeChatBindLink{Code: "Ab3xK9mQ2z", BotID: b.ID, ILinkUserID: "u1@im.wechat", ExpiresAt: 2000000000}
	if err := s.CreateWeChatBindLink(link); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateWeChatBindLink(&store.WeChatBindLink{Code: "Ab3xK9mQ2z", BotID: b.ID, ILinkUserID: "x", ExpiresAt: 1}); err == nil {
		t.Error("duplicate code accepted")
	}
	got2, err := s.GetWeChatBindLink("Ab3xK9mQ2z")
	if err != nil || got2 == nil || got2.ILinkUserID != "u1@im.wechat" || got2.ExpiresAt != 2000000000 || got2.CreatedAt == 0 {
		t.Fatalf("get link = %+v %v", got2, err)
	}
	s.CreateWeChatBindLink(&store.WeChatBindLink{Code: "Old0000000", BotID: b.ID, ILinkUserID: "u", ExpiresAt: 100})
	if err := s.PruneWeChatBindLinks(1000); err != nil {
		t.Fatal(err)
	}
	if l, _ := s.GetWeChatBindLink("Old0000000"); l != nil {
		t.Error("expired link not pruned")
	}
	if l, _ := s.GetWeChatBindLink("Ab3xK9mQ2z"); l == nil {
		t.Error("valid link pruned")
	}
}
