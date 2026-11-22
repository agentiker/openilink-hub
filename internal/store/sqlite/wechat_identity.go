package sqlite

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
	now := db.now()
	id.UpdatedAt = now
	_, err := db.Exec(`INSERT INTO wechat_identities (`+wechatIdentityCols+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (bot_id, ilink_user_id) DO UPDATE SET app_id = excluded.app_id, openid = excluded.openid,
		unionid = excluded.unionid, nickname = excluded.nickname, avatar_url = excluded.avatar_url, updated_at = excluded.updated_at`,
		id.BotID, id.ILinkUserID, id.AppID, id.OpenID, id.UnionID, id.Nickname, id.AvatarURL, now, now)
	return err
}

func (db *DB) GetWeChatIdentity(botID, ilinkUserID string) (*store.WeChatIdentity, error) {
	id, err := scanWeChatIdentity(db.QueryRow(`SELECT `+wechatIdentityCols+` FROM wechat_identities WHERE bot_id = ? AND ilink_user_id = ?`, botID, ilinkUserID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return id, err
}

func (db *DB) ListWeChatIdentities(botID string) (map[string]*store.WeChatIdentity, error) {
	rows, err := db.Query(`SELECT `+wechatIdentityCols+` FROM wechat_identities WHERE bot_id = ?`, botID)
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
	_, err := db.Exec(`DELETE FROM wechat_identities WHERE bot_id = ? AND ilink_user_id = ?`, botID, ilinkUserID)
	return err
}

func (db *DB) CreateWeChatBindLink(l *store.WeChatBindLink) error {
	if l.CreatedAt == 0 {
		l.CreatedAt = db.now()
	}
	_, err := db.Exec(`INSERT INTO wechat_bind_links (code, bot_id, ilink_user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
		l.Code, l.BotID, l.ILinkUserID, l.ExpiresAt, l.CreatedAt)
	return err
}

func (db *DB) GetWeChatBindLink(code string) (*store.WeChatBindLink, error) {
	var l store.WeChatBindLink
	err := db.QueryRow(`SELECT code, bot_id, ilink_user_id, expires_at, created_at FROM wechat_bind_links WHERE code = ?`, code).
		Scan(&l.Code, &l.BotID, &l.ILinkUserID, &l.ExpiresAt, &l.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &l, err
}

func (db *DB) PruneWeChatBindLinks(before int64) error {
	_, err := db.Exec(`DELETE FROM wechat_bind_links WHERE expires_at < ?`, before)
	return err
}

func (db *DB) FindWeChatIdentities(appID, openID, unionID string) ([]store.WeChatIdentity, error) {
	rows, err := db.Query(`SELECT `+wechatIdentityCols+` FROM wechat_identities WHERE (app_id = ? AND openid = ?) OR (? != '' AND unionid = ?) ORDER BY updated_at DESC`, appID, openID, unionID, unionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []store.WeChatIdentity
	for rows.Next() {
		id, err := scanWeChatIdentity(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *id)
	}
	return out, rows.Err()
}
