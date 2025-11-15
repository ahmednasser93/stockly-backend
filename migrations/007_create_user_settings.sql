-- Create user_settings table for storing user preferences like refresh interval
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  refresh_interval_minutes INTEGER NOT NULL DEFAULT 5,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings (user_id);

