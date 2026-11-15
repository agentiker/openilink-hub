package postgres

import (
	"database/sql"
	"errors"

	"github.com/openilink/openilink-hub/internal/store"
)

func (db *DB) GetSendQuota(botID, recipient string) (*store.SendQuota, error) {
	q := &store.SendQuota{BotID: botID, Recipient: recipient}
	err := db.QueryRow(`SELECT used, reset_at, updated_at FROM send_quota WHERE bot_id = $1 AND recipient = $2`,
		botID, recipient).Scan(&q.Used, &q.ResetAt, &q.UpdatedAt)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	return q, nil
}

func (db *DB) ListSendQuotas(botID string) ([]store.SendQuota, error) {
	rows, err := db.Query(`SELECT bot_id, recipient, used, reset_at, updated_at FROM send_quota
		WHERE bot_id = $1 ORDER BY updated_at DESC`, botID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []store.SendQuota
	for rows.Next() {
		var q store.SendQuota
		if err := rows.Scan(&q.BotID, &q.Recipient, &q.Used, &q.ResetAt, &q.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

func (db *DB) ResetSendQuota(botID, recipient string) error {
	now := db.now().Unix()
	_, err := db.Exec(`INSERT INTO send_quota (bot_id, recipient, used, reset_at, updated_at) VALUES ($1, $2, 0, $3, $4)
		ON CONFLICT (bot_id, recipient) DO UPDATE SET used = 0, reset_at = excluded.reset_at, updated_at = excluded.updated_at`,
		botID, recipient, now, now)
	return err
}

func (db *DB) AddSendQuotaUsed(botID, recipient string, n int) error {
	_, err := db.Exec(`INSERT INTO send_quota (bot_id, recipient, used, updated_at) VALUES ($1, $2, $3, $4)
		ON CONFLICT (bot_id, recipient) DO UPDATE SET used = send_quota.used + excluded.used, updated_at = excluded.updated_at`,
		botID, recipient, n, db.now().Unix())
	return err
}

func (db *DB) SetSendQuotaUsed(botID, recipient string, used int) error {
	_, err := db.Exec(`INSERT INTO send_quota (bot_id, recipient, used, updated_at) VALUES ($1, $2, $3, $4)
		ON CONFLICT (bot_id, recipient) DO UPDATE SET used = excluded.used, updated_at = excluded.updated_at`,
		botID, recipient, used, db.now().Unix())
	return err
}

func (db *DB) EnqueueOutbox(item *store.OutboxItem) (int64, error) {
	if item.CreatedAt == 0 {
		item.CreatedAt = db.now().Unix()
	}
	err := db.QueryRow(`INSERT INTO outbox (bot_id, recipient, text, file_name, data, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		item.BotID, item.Recipient, item.Text, item.FileName, item.Data, item.CreatedAt).Scan(&item.ID)
	return item.ID, err
}

func (db *DB) ListOutbox(botID, recipient string, limit int) ([]store.OutboxItem, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := db.Query(`SELECT id, bot_id, recipient, text, file_name, data, created_at FROM outbox
		WHERE bot_id = $1 AND recipient = $2 ORDER BY id LIMIT $3`, botID, recipient, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []store.OutboxItem
	for rows.Next() {
		var it store.OutboxItem
		if err := rows.Scan(&it.ID, &it.BotID, &it.Recipient, &it.Text, &it.FileName, &it.Data, &it.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (db *DB) CountOutbox(botID, recipient string) (int, error) {
	var n int
	err := db.QueryRow(`SELECT COUNT(*) FROM outbox WHERE bot_id = $1 AND recipient = $2`, botID, recipient).Scan(&n)
	return n, err
}

func (db *DB) CountOutboxByRecipient(botID string) (map[string]int, error) {
	rows, err := db.Query(`SELECT recipient, COUNT(*) FROM outbox WHERE bot_id = $1 GROUP BY recipient`, botID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var r string
		var n int
		if err := rows.Scan(&r, &n); err != nil {
			return nil, err
		}
		out[r] = n
	}
	return out, rows.Err()
}

func (db *DB) DeleteOutbox(ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := db.Exec(`DELETE FROM outbox WHERE id = ANY($1)`, ids)
	return err
}

func (db *DB) PruneOutbox(before int64) (int64, error) {
	res, err := db.Exec(`DELETE FROM outbox WHERE created_at < $1`, before)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
