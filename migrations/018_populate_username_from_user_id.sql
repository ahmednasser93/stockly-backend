-- Migration 018: Populate username from user_id and extract device_type from device_info
-- This migration populates the username columns by joining with the users table,
-- and extracts device_type from device_info strings

-- Step 1: Handle users without username - generate temporary username from email
-- Format: email_prefix_userid_prefix (e.g., john_doe_12345678)
UPDATE users 
SET username = REPLACE(LOWER(SUBSTR(email, 1, INSTR(email, '@') - 1)), '.', '_') || '_' || SUBSTR(id, 1, 8)
WHERE username IS NULL;

-- Step 2: Populate username in alerts table
UPDATE alerts 
SET username = (SELECT username FROM users WHERE users.id = alerts.user_id) 
WHERE username IS NULL;

-- Step 3: Populate username in user_push_tokens table
UPDATE user_push_tokens 
SET username = (SELECT username FROM users WHERE users.id = user_push_tokens.user_id) 
WHERE username IS NULL;

-- Step 4: Populate username in notifications_log table
UPDATE notifications_log 
SET username = (SELECT username FROM users WHERE users.id = notifications_log.user_id) 
WHERE username IS NULL;

-- Step 5: Populate username in user_settings table
UPDATE user_settings 
SET username = (SELECT username FROM users WHERE users.id = user_settings.user_id) 
WHERE username IS NULL;

-- Step 6: Populate username in user_notification_preferences table
UPDATE user_notification_preferences 
SET username = (SELECT username FROM users WHERE users.id = user_notification_preferences.user_id) 
WHERE username IS NULL;

-- Step 7: Populate username in user_favorite_stocks table
UPDATE user_favorite_stocks 
SET username = (SELECT username FROM users WHERE users.id = user_favorite_stocks.user_id) 
WHERE username IS NULL;

-- Step 8: Populate username in user_saved_news table
UPDATE user_saved_news 
SET username = (SELECT username FROM users WHERE users.id = user_saved_news.user_id) 
WHERE username IS NULL;

-- Step 9: Extract device_type from device_info
-- Parse device_info string to determine device type
UPDATE user_push_tokens 
SET device_type = CASE 
  WHEN device_info LIKE '%Android%' OR device_info LIKE '%android%' OR device_info LIKE '%ANDROID%' THEN 'android'
  WHEN device_info LIKE '%iOS%' OR device_info LIKE '%iPhone%' OR device_info LIKE '%iPad%' OR device_info LIKE '%ios%' OR device_info LIKE '%IOS%' THEN 'ios'
  WHEN device_info LIKE '%web%' OR device_info LIKE '%Web%' OR device_info LIKE '%WEB%' OR device_info LIKE '%Chrome%' OR device_info LIKE '%Firefox%' OR device_info LIKE '%Safari%' THEN 'web'
  ELSE 'unknown'
END
WHERE device_type IS NULL;

-- Step 10: For any remaining NULL usernames, set to 'unknown' as fallback
-- (This should not happen if Step 1 worked correctly, but adding as safety)
UPDATE alerts SET username = 'unknown' WHERE username IS NULL;
UPDATE user_push_tokens SET username = 'unknown' WHERE username IS NULL;
UPDATE notifications_log SET username = 'unknown' WHERE username IS NULL;
UPDATE user_settings SET username = 'unknown' WHERE username IS NULL;
UPDATE user_notification_preferences SET username = 'unknown' WHERE username IS NULL;
UPDATE user_favorite_stocks SET username = 'unknown' WHERE username IS NULL;
UPDATE user_saved_news SET username = 'unknown' WHERE username IS NULL;

-- Step 11: For any remaining NULL device_type, set to 'unknown'
UPDATE user_push_tokens SET device_type = 'unknown' WHERE device_type IS NULL;



