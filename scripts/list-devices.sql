-- SQL Query to list all devices from the Stockly database
-- This query retrieves all registered devices with their associated user information
-- 
-- Usage with wrangler:
--   Local:  wrangler d1 execute stockly --file=scripts/list-devices.sql
--   Remote: wrangler d1 execute stockly --remote --file=scripts/list-devices.sql
--
-- Or use the shell script: ./scripts/list-devices.sh [--remote|--local]

SELECT 
    upt.user_id, 
    upt.push_token, 
    upt.device_info,
    upt.device_type,
    u.username,
    upt.created_at, 
    upt.updated_at
FROM user_push_tokens upt
LEFT JOIN users u ON upt.user_id = u.id
ORDER BY upt.updated_at DESC;

