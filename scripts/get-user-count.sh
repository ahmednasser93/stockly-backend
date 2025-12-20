#!/bin/bash
# Script to get user count from the database

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "📊 Querying user statistics from database..."
echo "============================================"
echo ""

# Get total user count
echo "👥 Total Users:"
wrangler d1 execute stockly --remote --command="SELECT COUNT(*) as total_users FROM users;"

echo ""
echo "📝 Users with Username:"
wrangler d1 execute stockly --remote --command="SELECT COUNT(*) as users_with_username FROM users WHERE username IS NOT NULL;"

echo ""
echo "📧 Users without Username:"
wrangler d1 execute stockly --remote --command="SELECT COUNT(*) as users_without_username FROM users WHERE username IS NULL;"

echo ""
echo "📱 Total Registered Devices:"
wrangler d1 execute stockly --remote --command="SELECT COUNT(*) as total_devices FROM user_push_tokens;"

echo ""
echo "🔔 Total Alerts:"
wrangler d1 execute stockly --remote --command="SELECT COUNT(*) as total_alerts FROM alerts;"

echo ""
echo "✅ Active Alerts:"
wrangler d1 execute stockly --remote --command="SELECT COUNT(*) as active_alerts FROM alerts WHERE status = 'active';"

echo ""
echo "📊 Summary:"
wrangler d1 execute stockly --remote --command="
SELECT 
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM users WHERE username IS NOT NULL) as users_with_username,
  (SELECT COUNT(*) FROM user_push_tokens) as total_devices,
  (SELECT COUNT(*) FROM alerts) as total_alerts,
  (SELECT COUNT(*) FROM alerts WHERE status = 'active') as active_alerts;
"
