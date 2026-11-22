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

// WeChatBindLink maps a short code (the /w/{code} URL) to the iLink user a
// binding link was created for.
type WeChatBindLink struct {
	Code        string `json:"code"`
	BotID       string `json:"bot_id"`
	ILinkUserID string `json:"ilink_user_id"`
	ExpiresAt   int64  `json:"expires_at"` // unix seconds
	CreatedAt   int64  `json:"created_at"`
}

type WeChatIdentityStore interface {
	// UpsertWeChatIdentity inserts or replaces the identity for (BotID, ILinkUserID).
	UpsertWeChatIdentity(id *WeChatIdentity) error
	// GetWeChatIdentity returns nil, nil if none.
	GetWeChatIdentity(botID, ilinkUserID string) (*WeChatIdentity, error)
	// ListWeChatIdentities returns all identities bound through a bot, keyed by ilink user id.
	ListWeChatIdentities(botID string) (map[string]*WeChatIdentity, error)
	DeleteWeChatIdentity(botID, ilinkUserID string) error
	// FindWeChatIdentities returns identities matching (appID, openID), or
	// unionID when non-empty, across all bots, most recently updated first.
	FindWeChatIdentities(appID, openID, unionID string) ([]WeChatIdentity, error)

	// CreateWeChatBindLink stores a short link; it fails if the code exists.
	CreateWeChatBindLink(l *WeChatBindLink) error
	// GetWeChatBindLink returns nil, nil if the code is unknown (expiry is the caller's check).
	GetWeChatBindLink(code string) (*WeChatBindLink, error)
	// PruneWeChatBindLinks deletes links that expired before the given unix time.
	PruneWeChatBindLinks(before int64) error
}
