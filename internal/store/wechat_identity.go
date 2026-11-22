package store

// WeChatIdentity links an iLink user (as seen by one bot) to a real WeChat
// identity obtained through 服务号网页授权 (official-account web OAuth).
// iLink itself exposes no profile data; this is the only source of
// nickname/avatar/openid/unionid.
type WeChatIdentity struct {
	BotID       string `json:"bot_id"`
	ILinkUserID string `json:"ilink_user_id"`
	AppID       string `json:"app_id"` // 服务号 AppID the openid belongs to
	OpenID      string `json:"openid"`
	UnionID     string `json:"unionid,omitempty"`
	Nickname    string `json:"nickname,omitempty"`
	AvatarURL   string `json:"avatar_url,omitempty"`
	CreatedAt   int64  `json:"created_at"`
	UpdatedAt   int64  `json:"updated_at"`
}

type WeChatIdentityStore interface {
	// UpsertWeChatIdentity inserts or replaces the identity for (BotID, ILinkUserID).
	UpsertWeChatIdentity(id *WeChatIdentity) error
	// GetWeChatIdentity returns nil, nil if none.
	GetWeChatIdentity(botID, ilinkUserID string) (*WeChatIdentity, error)
	// ListWeChatIdentities returns all identities bound through a bot, keyed by ilink user id.
	ListWeChatIdentities(botID string) (map[string]*WeChatIdentity, error)
	DeleteWeChatIdentity(botID, ilinkUserID string) error
}
