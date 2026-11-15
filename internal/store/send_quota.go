package store

// SendQuota tracks how many messages the bot sent a recipient since that
// recipient last messaged the bot. iLink allows a fixed number (10) per
// inbound message; see github.com/agentiker/wxilink-sdk-go/quota.
type SendQuota struct {
	BotID     string `json:"bot_id"`
	Recipient string `json:"recipient"`
	Used      int    `json:"used"`
	ResetAt   int64  `json:"reset_at"`   // unix seconds of last inbound (0 = never seen)
	UpdatedAt int64  `json:"updated_at"` // unix seconds
}

// OutboxItem is a message waiting for the recipient to message the bot,
// which restores the send allowance.
type OutboxItem struct {
	ID        int64  `json:"id"`
	BotID     string `json:"bot_id"`
	Recipient string `json:"recipient"`
	Text      string `json:"text,omitempty"`
	FileName  string `json:"file_name,omitempty"`
	Data      []byte `json:"-"`
	CreatedAt int64  `json:"created_at"` // unix seconds
}

type SendQuotaStore interface {
	// GetSendQuota returns the quota row, or a zero row (Used=0) if none.
	GetSendQuota(botID, recipient string) (*SendQuota, error)
	ListSendQuotas(botID string) ([]SendQuota, error)
	// ResetSendQuota sets used=0 and reset_at=now (an inbound message).
	ResetSendQuota(botID, recipient string) error
	AddSendQuotaUsed(botID, recipient string, n int) error
	SetSendQuotaUsed(botID, recipient string, used int) error

	EnqueueOutbox(item *OutboxItem) (int64, error)
	// ListOutbox returns pending items oldest first.
	ListOutbox(botID, recipient string, limit int) ([]OutboxItem, error)
	CountOutbox(botID, recipient string) (int, error)
	// CountOutboxByRecipient returns pending counts for all recipients of a bot.
	CountOutboxByRecipient(botID string) (map[string]int, error)
	DeleteOutbox(ids []int64) error
	// PruneOutbox deletes items created before the given unix time.
	PruneOutbox(before int64) (int64, error)
}
