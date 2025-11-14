CREATE TABLE IF NOT EXISTS user_push_tokens (
  user_id TEXT PRIMARY KEY,
  push_token TEXT NOT NULL,
  device_info TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_token ON user_push_tokens (push_token);

