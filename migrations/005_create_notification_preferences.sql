-- Create user_notification_preferences table
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  quiet_start TEXT,
  quiet_end TEXT,
  allowed_symbols TEXT,
  max_daily INTEGER,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id ON user_notification_preferences (user_id);

