-- +goose Up
-- Real WeChat identities (服务号网页授权) bound to iLink users per bot.
CREATE TABLE IF NOT EXISTS wechat_identities (
    bot_id         TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    ilink_user_id  TEXT NOT NULL,
    app_id         TEXT NOT NULL DEFAULT '',
    openid         TEXT NOT NULL,
    unionid        TEXT NOT NULL DEFAULT '',
    nickname       TEXT NOT NULL DEFAULT '',
    avatar_url     TEXT NOT NULL DEFAULT '',
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    PRIMARY KEY (bot_id, ilink_user_id)
);
CREATE INDEX IF NOT EXISTS idx_wechat_identities_unionid ON wechat_identities (unionid);

-- +goose Down
DROP TABLE IF EXISTS wechat_identities;
