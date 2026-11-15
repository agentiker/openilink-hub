package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
)

// SendErrorKind classifies why a provider refused to deliver a message.
type SendErrorKind int

const (
	// SendErrUnknown is any other upstream refusal.
	SendErrUnknown SendErrorKind = iota
	// SendErrNoSession: the recipient has no usable session with the bot and
	// must send the bot a message first (iLink ret=-2 "prepare failed").
	SendErrNoSession
	// SendErrInvalidRecipient: bad recipient or parameters (iLink ret=-3).
	SendErrInvalidRecipient
	// SendErrAuthExpired: the bot credentials are no longer valid and the bot
	// must be re-bound (iLink errcode=-14).
	SendErrAuthExpired
)

func (k SendErrorKind) String() string {
	switch k {
	case SendErrNoSession:
		return "no_session"
	case SendErrInvalidRecipient:
		return "invalid_recipient"
	case SendErrAuthExpired:
		return "auth_expired"
	}
	return "unknown"
}

// SendError is returned by Provider.Send when the upstream service refused
// the message (as opposed to local or transport failures).
type SendError struct {
	Kind SendErrorKind
	Code int    // provider-specific code (e.g. iLink ret/errcode)
	Msg  string // provider-specific message
	Err  error  // underlying error
}

func (e *SendError) Error() string {
	return fmt.Sprintf("send refused (%s, code=%d): %s", e.Kind, e.Code, e.Msg)
}

func (e *SendError) Unwrap() error { return e.Err }

// QueuedError is returned by Send when the message was not delivered now but
// stored for automatic delivery once the recipient messages the bot again
// (the per-inbound send allowance is used up). Callers should treat it as
// accepted, not failed.
type QueuedError struct {
	ID      int64 // outbox item ID
	Pending int   // messages waiting for this recipient, including this one
}

func (e *QueuedError) Error() string {
	return fmt.Sprintf("queued for delivery after the recipient replies (pending=%d)", e.Pending)
}

// AsQueued reports whether err is a *QueuedError.
func AsQueued(err error) (*QueuedError, bool) {
	var qe *QueuedError
	if errors.As(err, &qe) {
		return qe, true
	}
	return nil, false
}

// SendQuotaer is implemented by providers whose upstream limits how many
// messages may be sent per inbound user message. Zero means unlimited.
type SendQuotaer interface {
	SendQuota() int
}

// DefaultRecipienter is implemented by providers that resolve an empty
// OutboundMessage.Recipient to a default user.
type DefaultRecipienter interface {
	DefaultRecipient() string
}

// SendErrorKindOf returns the kind of a *SendError in err's chain, or
// SendErrUnknown with ok=false if there is none.
func SendErrorKindOf(err error) (kind SendErrorKind, ok bool) {
	var se *SendError
	if errors.As(err, &se) {
		return se.Kind, true
	}
	return SendErrUnknown, false
}

// Provider abstracts a messaging bot connection (iLink, future providers, etc.).
type Provider interface {
	Name() string
	Start(ctx context.Context, opts StartOptions) error
	Stop()
	Send(ctx context.Context, msg OutboundMessage) (string, error)
	SendTyping(ctx context.Context, recipient, ticket string, typing bool) error
	GetConfig(ctx context.Context, recipient, contextToken string) (*BotConfig, error)
	DownloadMedia(ctx context.Context, media *Media) ([]byte, error)
	DownloadVoice(ctx context.Context, media *Media, sampleRate int) ([]byte, error)
	Status() string
}

// BotConfig holds provider-specific configuration (e.g. typing ticket).
type BotConfig struct {
	TypingTicket string `json:"typing_ticket,omitempty"`
}

// Binder is an optional interface for providers that support QR/interactive binding.
type Binder interface {
	StartBind(ctx context.Context) (*BindSession, error)
}

type BindSession struct {
	SessionID string
	QRURL     string
	// PollStatus is called repeatedly; returns final credentials on success.
	PollStatus func(ctx context.Context) (*BindPollResult, error)
}

type BindPollResult struct {
	Status      string          // "wait", "scanned", "expired", "confirmed"
	QRURL       string          // new QR URL on refresh
	Credentials json.RawMessage // set on "confirmed"
}

type StartOptions struct {
	Credentials  json.RawMessage
	SyncState    json.RawMessage
	OnMessage    func(InboundMessage)
	OnStatus     func(status string)
	OnSyncUpdate func(state json.RawMessage)
}

type InboundMessage struct {
	ExternalID   string
	Sender       string
	Recipient    string
	GroupID      string // non-empty for group messages
	Timestamp    int64
	MessageState int // 0=new, 1=generating, 2=finish
	Items        []MessageItem
	ContextToken string
	SessionID    string
	Raw          json.RawMessage `json:"-"` // original provider message, not serialized in relay
}

type OutboundMessage struct {
	Recipient    string
	Text         string
	ContextToken string
	// Media (optional): if Data is set, sends as media file
	Data     []byte
	FileName string
}

type MessageItem struct {
	Type     string  `json:"type"` // "text", "image", "voice", "file", "video"
	Text     string  `json:"text,omitempty"`
	FileName string  `json:"file_name,omitempty"`
	Media    *Media  `json:"media,omitempty"`
	RefMsg   *RefMsg `json:"ref_msg,omitempty"`
}

// Media holds CDN media info for image/voice/file/video items.
type Media struct {
	URL               string `json:"url,omitempty"`
	StorageKey        string `json:"-"` // MinIO object key, not serialized
	EncryptQueryParam string `json:"encrypt_query_param,omitempty"`
	AESKey            string `json:"aes_key,omitempty"`
	FileSize          int64  `json:"file_size,omitempty"`
	MediaType         string `json:"media_type,omitempty"` // "image", "voice", "file", "video"
	// Voice-specific
	PlayTime int `json:"play_time,omitempty"` // seconds
	// Video/image thumbnail
	ThumbEQP    string `json:"thumb_eqp,omitempty"`
	ThumbAESKey string `json:"thumb_aes_key,omitempty"`
	ThumbURL    string `json:"thumb_url,omitempty"`
	// Video-specific
	PlayLength  int `json:"play_length,omitempty"` // seconds
	ThumbWidth  int `json:"thumb_width,omitempty"`
	ThumbHeight int `json:"thumb_height,omitempty"`
}

// RefMsg represents a quoted/referenced message.
type RefMsg struct {
	Title string      `json:"title,omitempty"`
	Item  MessageItem `json:"item"`
}

// --- Registry ---

type Factory func() Provider

var (
	registryMu sync.RWMutex
	registry   = map[string]Factory{}
)

func Register(name string, f Factory) {
	registryMu.Lock()
	defer registryMu.Unlock()
	registry[name] = f
}

func Get(name string) (Factory, bool) {
	registryMu.RLock()
	defer registryMu.RUnlock()
	f, ok := registry[name]
	return f, ok
}
