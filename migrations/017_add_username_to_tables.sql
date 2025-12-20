-- Migration 017: Add username columns to all tables and device_type to user_push_tokens
-- This migration adds username columns to all tables that reference users,
-- and adds device_type column to user_push_tokens for better device management

-- Add username column to alerts table
ALTER TABLE alerts ADD COLUMN username TEXT;

-- Add username column to user_push_tokens table
ALTER TABLE user_push_tokens ADD COLUMN username TEXT;

-- Add username column to notifications_log table
ALTER TABLE notifications_log ADD COLUMN username TEXT;

-- Add username column to user_settings table
ALTER TABLE user_settings ADD COLUMN username TEXT;

-- Add username column to user_notification_preferences table
ALTER TABLE user_notification_preferences ADD COLUMN username TEXT;

-- Add username column to user_favorite_stocks table
ALTER TABLE user_favorite_stocks ADD COLUMN username TEXT;

-- Add username column to user_saved_news table
ALTER TABLE user_saved_news ADD COLUMN username TEXT;

-- Add device_type column to user_push_tokens table
-- Values: 'android', 'ios', 'web', 'unknown'
ALTER TABLE user_push_tokens ADD COLUMN device_type TEXT;

-- Create indexes on username columns for performance
CREATE INDEX IF NOT EXISTS idx_alerts_username ON alerts(username);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_username ON user_push_tokens(username);
CREATE INDEX IF NOT EXISTS idx_notifications_log_username ON notifications_log(username);
CREATE INDEX IF NOT EXISTS idx_user_settings_username ON user_settings(username);
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_username ON user_notification_preferences(username);
CREATE INDEX IF NOT EXISTS idx_user_favorite_stocks_username ON user_favorite_stocks(username);
CREATE INDEX IF NOT EXISTS idx_user_saved_news_username ON user_saved_news(username);

-- Create index on device_type for filtering
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_device_type ON user_push_tokens(device_type);





