-- SQL Query to list all devices from the Stockly database
-- This query retrieves all registered devices with their associated user information
-- 
-- Usage with wrangler:
--   Local:  wrangler d1 execute stockly --file=scripts/list-devices.sql
--   Remote: wrangler d1 execute stockly --remote --file=scripts/list-devices.sql
--
-- Or use the shell script: ./scripts/list-devices.sh [--remote|--local]

SELECT 
    d.id as device_id,
    d.user_id,
    d.device_info,
    d.device_type,
    u.username,
    dpt.push_token,
    d.created_at,
    d.updated_at,
    d.is_active
FROM devices d
INNER JOIN device_push_tokens dpt ON d.id = dpt.device_id
LEFT JOIN users u ON d.user_id = u.id
WHERE d.is_active = 1 AND dpt.is_active = 1
ORDER BY d.updated_at DESC;

