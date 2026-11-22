package postgres

import (
	"database/sql"
	"errors"

	"github.com/openilink/openilink-hub/internal/store"
)

const wechatIdentityCols = `bot_id, ilink_user_id, app_id, openid, unionid, nickname, avatar_url, created_at, updated_at`

func scanWeChatIdentity(sc interface{ Scan(...any) error }) (*store.WeChatIdentity, error) {
	var id store.WeChatIdentity
	err := sc.Scan(&id.BotID, &id.ILinkUserID, &id.AppID, &id.OpenID, &id.UnionID, &id.Nickname, &id.AvatarURL, &id.CreatedAt, &id.UpdatedAt)
	return &id, err
}

func (db *DB) UpsertWeChatIdentity(id *store.WeChatIdentity) error {
	now := db.now().Unix()
	id.UpdatedAt = now
	_, err := db.Exec(`INSERT INTO wechat_identities (`+wechatIdentityCols+`) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (bot_id, ilink_user_id) DO UPDATE SET app_id = excluded.app_id, openid = excluded.openid,
		unionid = excluded.unionid, nickname = excluded.nickname, avatar_url = excluded.avatar_url, updated_at = excluded.updated_at`,
		id.BotID, id.ILinkUserID, id.AppID, id.OpenID, id.UnionID, id.Nickname, id.AvatarURL, now, now)
	return err
}

func (db *DB) GetWeChatIdentity(botID, ilinkUserID string) (*store.WeChatIdentity, error) {
	id, err := scanWeChatIdentity(db.QueryRow(`SELECT `+wechatIdentityCols+` FROM wechat_identities WHERE bot_id = $1 AND ilink_user_id = $2`, botID, ilinkUserID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return id, err
}

func (db *DB) ListWeChatIdentities(botID string) (map[string]*store.WeChatIdentity, error) {
	rows, err := db.Query(`SELECT `+wechatIdentityCols+` FROM wechat_identities WHERE bot_id = $1`, botID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]*store.WeChatIdentity{}
	for rows.Next() {
		id, err := scanWeChatIdentity(rows)
		if err != nil {
			return nil, err
		}
		out[id.ILinkUserID] = id
	}
	return out, rows.Err()
}

func (db *DB) DeleteWeChatIdentity(botID, ilinkUserID string) error {
	_, err := db.Exec(`DELETE FROM wechat_identities WHERE bot_id = $1 AND ilink_user_id = $2`, botID, ilinkUserID)
	return err
}

func (db *DB) CreateWeChatBindLink(l *store.WeChatBindLink) error {
	if l.CreatedAt == 0 {
		l.CreatedAt = db.now().Unix()
	}
	_, err := db.Exec(`INSERT INTO wechat_bind_links (code, bot_id, ilink_user_id, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)`,
		l.Code, l.BotID, l.ILinkUserID, l.ExpiresAt, l.CreatedAt)
	return err
}

func (db *DB) GetWeChatBindLink(code string) (*store.WeChatBindLink, error) {
	var l store.WeChatBindLink
	err := db.QueryRow(`SELECT code, bot_id, ilink_user_id, expires_at, created_at FROM wechat_bind_links WHERE code = $1`, code).
		Scan(&l.Code, &l.BotID, &l.ILinkUserID, &l.ExpiresAt, &l.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &l, err
}

func (db *DB) PruneWeChatBindLinks(before int64) error {
	_, err := db.Exec(`DELETE FROM wechat_bind_links WHERE expires_at < $1`, before)
	return err
}
