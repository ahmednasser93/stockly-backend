-- Create user_senator_follows table for tracking which senators users follow
-- Users can follow specific senators and configure alert preferences per senator
CREATE TABLE IF NOT EXISTS user_senator_follows (
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  senator_name TEXT NOT NULL,
  alert_on_purchase INTEGER NOT NULL DEFAULT 1,
  alert_on_sale INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (user_id, senator_name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_senator_follows_user_id ON user_senator_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_user_senator_follows_username ON user_senator_follows(username);
CREATE INDEX IF NOT EXISTS idx_user_senator_follows_senator_name ON user_senator_follows(senator_name);


