-- Migration 021: Fix user_push_tokens username column
-- This migration ensures the username and device_type columns exist in user_push_tokens table
-- Migration 017 may have partially failed, so we need to add these columns safely

-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN.
-- If the column already exists, this will fail with "duplicate column name" error.
-- The deployment script uses || echo to continue on error, so this is safe.

-- Add username column to user_push_tokens (only if it doesn't exist)
-- If it exists, the migration will fail but deployment will continue
ALTER TABLE user_push_tokens ADD COLUMN username TEXT;

-- Add device_type column to user_push_tokens (only if it doesn't exist)
ALTER TABLE user_push_tokens ADD COLUMN device_type TEXT;

-- Create indexes (these use IF NOT EXISTS so they're safe)
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_username ON user_push_tokens(username);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_device_type ON user_push_tokens(device_type);
