-- +goose Up
-- iLink allows the bot 10 messages per inbound user message. send_quota
-- counts sends since the recipient last wrote; outbox holds messages that
-- exceeded the allowance until the recipient writes again.
CREATE TABLE IF NOT EXISTS send_quota (
    bot_id      TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    recipient   TEXT NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0,
    reset_at    BIGINT NOT NULL DEFAULT 0,
    updated_at  BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (bot_id, recipient)
);

CREATE TABLE IF NOT EXISTS outbox (
    id          BIGSERIAL PRIMARY KEY,
    bot_id      TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    recipient   TEXT NOT NULL,
    text        TEXT NOT NULL DEFAULT '',
    file_name   TEXT NOT NULL DEFAULT '',
    data        BYTEA,
    created_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_bot_recipient ON outbox (bot_id, recipient, id);

-- +goose Down
DROP TABLE IF EXISTS outbox;
DROP TABLE IF EXISTS send_quota;
