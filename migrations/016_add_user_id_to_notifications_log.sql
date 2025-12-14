-- Add user_id column to notifications_log table for user association
-- This allows notification logs to be associated with users and display usernames

-- Add user_id column (nullable initially to allow migration of existing data)
ALTER TABLE notifications_log ADD COLUMN user_id TEXT;

-- Create index on user_id for performance
CREATE INDEX IF NOT EXISTS idx_notifications_log_user_id ON notifications_log(user_id);

-- Note: We can get user_id from the alert_id by joining with alerts table
-- For existing records, we can populate user_id from alerts table:
-- UPDATE notifications_log 
-- SET user_id = (SELECT user_id FROM alerts WHERE alerts.id = notifications_log.alert_id)
-- WHERE user_id IS NULL;


