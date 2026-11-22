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
