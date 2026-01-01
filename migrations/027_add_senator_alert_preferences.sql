-- Add senator alert preferences to user_notification_preferences table
-- These preferences control how senator trading alerts are delivered to users
-- Note: SQLite doesn't support adding NOT NULL columns with defaults directly
-- We'll add them as nullable first, then update existing rows, then add NOT NULL constraint
-- However, SQLite limitations mean we can't add NOT NULL constraints after the fact
-- So we add them as nullable with defaults and handle nulls in application code

-- Check if columns exist before adding (SQLite doesn't support IF NOT EXISTS for ALTER TABLE)
-- In practice, this migration should only run once
-- If columns already exist, the migration will fail - this is expected behavior

ALTER TABLE user_notification_preferences 
ADD COLUMN senator_alerts_enabled INTEGER DEFAULT 1;

ALTER TABLE user_notification_preferences 
ADD COLUMN senator_alert_holdings_only INTEGER DEFAULT 0;

ALTER TABLE user_notification_preferences 
ADD COLUMN senator_alert_followed_only INTEGER DEFAULT 0;

-- Update existing rows to set default values
UPDATE user_notification_preferences 
SET senator_alerts_enabled = 1 
WHERE senator_alerts_enabled IS NULL;

UPDATE user_notification_preferences 
SET senator_alert_holdings_only = 0 
WHERE senator_alert_holdings_only IS NULL;

UPDATE user_notification_preferences 
SET senator_alert_followed_only = 0 
WHERE senator_alert_followed_only IS NULL;

