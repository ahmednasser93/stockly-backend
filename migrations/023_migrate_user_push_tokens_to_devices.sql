-- Migration 023: Migrate data from user_push_tokens to devices and device_push_tokens
-- This migration transfers all existing device and push token data to the new schema
-- Strategy:
--   1. Group by user_id + device_info to identify unique devices
--   2. Create device records (one per unique device)
--   3. Create push token records linked to devices
--   4. Generate device_identifier as a simple identifier (we'll use a combination approach)

-- Step 1: Create devices from unique user_id + device_info combinations
-- For devices with the same user_id and device_info, we'll create one device record
-- and link all push tokens to that device
INSERT INTO devices (user_id, device_info, device_type, is_active, last_seen_at, created_at, updated_at)
SELECT DISTINCT
  upt.user_id,
  upt.device_info,
  upt.device_type,
  1 as is_active,
  MAX(upt.updated_at) as last_seen_at,
  MIN(upt.created_at) as created_at,
  MAX(upt.updated_at) as updated_at
FROM user_push_tokens upt
WHERE upt.user_id IS NOT NULL
GROUP BY upt.user_id, COALESCE(upt.device_info, 'unknown'), COALESCE(upt.device_type, 'unknown');

-- Step 2: Create device_push_tokens records linked to devices
-- Match push tokens to devices based on user_id + device_info
INSERT INTO device_push_tokens (device_id, push_token, is_active, created_at, updated_at)
SELECT 
  d.id as device_id,
  upt.push_token,
  1 as is_active,
  upt.created_at,
  upt.updated_at
FROM user_push_tokens upt
INNER JOIN devices d ON 
  d.user_id = upt.user_id AND
  COALESCE(d.device_info, 'unknown') = COALESCE(upt.device_info, 'unknown') AND
  COALESCE(d.device_type, 'unknown') = COALESCE(upt.device_type, 'unknown')
WHERE upt.push_token IS NOT NULL;

-- Step 3: Update device_identifier for all devices
-- Use a combination of user_id and device_info as identifier
-- For SQLite, we'll use a simple concatenation (hash will be computed in application code)
UPDATE devices
SET device_identifier = user_id || '|' || COALESCE(device_info, 'unknown') || '|' || COALESCE(device_type, 'unknown')
WHERE device_identifier IS NULL;

-- Note: The old user_push_tokens table will remain for backward compatibility
-- It can be removed in a future migration after verifying the new schema works correctly

