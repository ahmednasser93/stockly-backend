-- Cleanup script to remove old Expo push tokens
-- Run this on the production database to clean up tokens that start with "ExponentPushToken["

-- Option 1: Delete all Expo tokens from user_push_tokens table
DELETE FROM user_push_tokens 
WHERE push_token LIKE 'ExponentPushToken[%';

-- Option 2: Delete all alerts that use Expo tokens
DELETE FROM alerts 
WHERE target LIKE 'ExponentPushToken[%';

-- Option 3: Delete all notification logs with Expo tokens
DELETE FROM notifications_log 
WHERE push_token LIKE 'ExponentPushToken[%';

-- Check remaining Expo tokens (for verification)
SELECT COUNT(*) as expo_tokens_count 
FROM user_push_tokens 
WHERE push_token LIKE 'ExponentPushToken[%';

SELECT COUNT(*) as expo_alerts_count 
FROM alerts 
WHERE target LIKE 'ExponentPushToken[%';

