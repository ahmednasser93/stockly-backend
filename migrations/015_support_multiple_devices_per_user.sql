-- Migration 015: Support multiple devices per user
-- Change user_push_tokens to allow multiple devices per user
-- Each device has a unique FCM token, so we can use push_token as the unique identifier

-- Step 1: Create new table with proper schema
CREATE TABLE IF NOT EXISTS user_push_tokens_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  push_token TEXT NOT NULL UNIQUE,
  device_info TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Step 2: Copy existing data (keep only the most recent token per user if duplicates exist)
INSERT INTO user_push_tokens_new (user_id, push_token, device_info, created_at, updated_at)
SELECT 
  user_id,
  push_token,
  device_info,
  created_at,
  updated_at
FROM user_push_tokens
WHERE (user_id, updated_at) IN (
  SELECT user_id, MAX(updated_at)
  FROM user_push_tokens
  GROUP BY user_id
);

-- Step 3: Drop old table
DROP TABLE IF EXISTS user_push_tokens;

-- Step 4: Rename new table to original name
ALTER TABLE user_push_tokens_new RENAME TO user_push_tokens;

-- Step 5: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id ON user_push_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_token ON user_push_tokens (push_token);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_updated_at ON user_push_tokens (updated_at);

