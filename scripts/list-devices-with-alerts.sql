-- SQL Query to list all devices with alert counts
-- This query retrieves all registered devices with their associated user information
-- and includes alert statistics (total alerts and active alerts)
--
-- Usage with wrangler:
--   Local:  wrangler d1 execute stockly --file=scripts/list-devices-with-alerts.sql
--   Remote: wrangler d1 execute stockly --remote --file=scripts/list-devices-with-alerts.sql

SELECT 
    upt.user_id, 
    upt.push_token, 
    upt.device_info,
    upt.device_type,
    u.username,
    COUNT(DISTINCT a.id) as alert_count,
    COUNT(DISTINCT CASE WHEN a.status = 'active' THEN a.id END) as active_alert_count,
    upt.created_at, 
    upt.updated_at
FROM user_push_tokens upt
LEFT JOIN users u ON upt.user_id = u.id
LEFT JOIN alerts a ON a.username = u.username
GROUP BY upt.user_id, upt.push_token, upt.device_info, upt.device_type, u.username, upt.created_at, upt.updated_at
ORDER BY upt.updated_at DESC;

