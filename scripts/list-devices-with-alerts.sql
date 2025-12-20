-- SQL Query to list all devices with alert counts
-- This query retrieves all registered devices with their associated user information
-- and includes alert statistics (total alerts and active alerts)
--
-- Usage with wrangler:
--   Local:  wrangler d1 execute stockly --file=scripts/list-devices-with-alerts.sql
--   Remote: wrangler d1 execute stockly --remote --file=scripts/list-devices-with-alerts.sql

SELECT 
    d.id as device_id,
    d.user_id, 
    d.device_info,
    d.device_type,
    u.username,
    dpt.push_token,
    COUNT(DISTINCT a.id) as alert_count,
    COUNT(DISTINCT CASE WHEN a.status = 'active' THEN a.id END) as active_alert_count,
    d.created_at, 
    d.updated_at,
    d.is_active
FROM devices d
INNER JOIN device_push_tokens dpt ON d.id = dpt.device_id
LEFT JOIN users u ON d.user_id = u.id
LEFT JOIN alerts a ON a.username = u.username
WHERE d.is_active = 1 AND dpt.is_active = 1
GROUP BY d.id, d.user_id, d.device_info, d.device_type, u.username, dpt.push_token, d.created_at, d.updated_at, d.is_active
ORDER BY d.updated_at DESC;

