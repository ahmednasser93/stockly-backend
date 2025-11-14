#!/bin/bash
# Script to clean up old Expo push tokens from production database

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🧹 Cleaning up old Expo push tokens from production database"
echo "============================================================"
echo ""
echo "⚠️  WARNING: This will delete:"
echo "   - All user push tokens starting with 'ExponentPushToken['"
echo "   - All alerts using Expo tokens"
echo "   - All notification logs with Expo tokens"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "❌ Cleanup cancelled"
  exit 1
fi

cd "$PROJECT_ROOT/api"

echo ""
echo "🗑️  Deleting Expo tokens from user_push_tokens..."
wrangler d1 execute stockly --remote --command="DELETE FROM user_push_tokens WHERE push_token LIKE 'ExponentPushToken[%';"

echo ""
echo "🗑️  Deleting alerts with Expo tokens..."
wrangler d1 execute stockly --remote --command="DELETE FROM alerts WHERE target LIKE 'ExponentPushToken[%';"

echo ""
echo "🗑️  Deleting notification logs with Expo tokens..."
wrangler d1 execute stockly --remote --command="DELETE FROM notifications_log WHERE push_token LIKE 'ExponentPushToken[%';"

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📊 Verification:"
echo "   Remaining Expo tokens in user_push_tokens:"
wrangler d1 execute stockly --remote --command="SELECT COUNT(*) as count FROM user_push_tokens WHERE push_token LIKE 'ExponentPushToken[%';"

echo ""
echo "   Remaining alerts with Expo tokens:"
wrangler d1 execute stockly --remote --command="SELECT COUNT(*) as count FROM alerts WHERE target LIKE 'ExponentPushToken[%';"

echo ""
echo "✅ Users will need to:"
echo "   1. Open the mobile app"
echo "   2. Allow notifications (if prompted)"
echo "   3. The app will automatically register a new FCM token"
echo "   4. Create new alerts (they will use FCM tokens)"

