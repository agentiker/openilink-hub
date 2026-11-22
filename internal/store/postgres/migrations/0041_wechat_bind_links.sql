-- +goose Up
-- Short identity-binding links: /w/{code} → (bot, ilink user).
CREATE TABLE IF NOT EXISTS wechat_bind_links (
    code           TEXT PRIMARY KEY,
    bot_id         TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    ilink_user_id  TEXT NOT NULL,
    expires_at     BIGINT NOT NULL,
    created_at     BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wechat_bind_links_expires ON wechat_bind_links (expires_at);

-- +goose Down
DROP TABLE IF EXISTS wechat_bind_links;
