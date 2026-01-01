#!/bin/bash

# ==============================================================================
# Stockly API Production Deployment Script
# ==============================================================================
# Runs tests, then database migrations, and deploys the API (non-interactive)
# ==============================================================================
# NOTE: This script is kept for backward compatibility.
#       For unified deployment (API + Webapp), use: ../../scripts/deploy-to-prod.sh
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"

cd "$API_DIR"

echo "🚀 Deploying Stockly API to Production"
echo "================================================"
echo ""

# Check if SKIP_TESTS environment variable is set
if [ "${SKIP_TESTS}" != "true" ]; then
  echo "🧪 Running Tests..."
  echo "------------------------------------------------"
  echo "⚠️  All tests must pass before deployment can proceed"
  echo ""

  # Run tests - exit immediately if they fail
  # With set -e, the script will stop here if tests fail
  npm run test

  # If we reach here, tests passed
  echo ""
  echo "✅ All tests passed!"
  echo ""
else
  echo "⚠️  SKIP_TESTS is set to true. Skipping tests (NOT RECOMMENDED)."
  echo ""
fi

echo "🗄️  Running Database Migrations (Production)..."
echo "------------------------------------------------"

# Run migrations in order (non-interactive with --yes)
echo "Migration 1/11: 001_init.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/001_init.sql || echo "⚠️  Migration 1 already applied or failed"

echo "Migration 2/11: 002_add_search_cache.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/002_add_search_cache.sql || echo "⚠️  Migration 2 already applied or failed"

echo "Migration 3/11: 003_create_alerts.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/003_create_alerts.sql || echo "⚠️  Migration 3 already applied or failed"

echo "Migration 4/11: 004_create_user_push_tokens.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/004_create_user_push_tokens.sql || echo "⚠️  Migration 4 already applied or failed"

echo "Migration 5/11: 005_create_notification_preferences.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/005_create_notification_preferences.sql || echo "⚠️  Migration 5 already applied or failed"

echo "Migration 6/11: 006_create_notifications_log.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/006_create_notifications_log.sql || echo "⚠️  Migration 6 already applied or failed"

echo "Migration 7/11: 007_create_user_settings.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/007_create_user_settings.sql || echo "⚠️  Migration 7 already applied or failed"

echo "Migration 8/11: 008_create_historical_prices.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/008_create_historical_prices.sql || echo "⚠️  Migration 8 already applied or failed"

echo "Migration 9/11: 009_add_ohlc_to_historical_prices.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/009_add_ohlc_to_historical_prices.sql || echo "⚠️  Migration 9 already applied or failed"

echo "Migration 10/11: 010_news_feed.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/010_news_feed.sql || echo "⚠️  Migration 10 already applied or failed"

echo "Migration 11/11: 011_add_cache_settings.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/011_add_cache_settings.sql || echo "⚠️  Migration 11 already applied or failed"

echo "Migration 12/14: 012_create_users.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/012_create_users.sql || echo "⚠️  Migration 12 already applied or failed"

echo "Migration 13/14: 013_add_user_id_to_alerts.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/013_add_user_id_to_alerts.sql || echo "⚠️  Migration 13 already applied or failed"

echo "Migration 14/15: 014_create_user_favorite_stocks.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/014_create_user_favorite_stocks.sql || echo "⚠️  Migration 14 already applied or failed"

echo "Migration 15/16: 015_support_multiple_devices_per_user.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/015_support_multiple_devices_per_user.sql || echo "⚠️  Migration 15 already applied or failed"

echo "Migration 16/19: 016_add_user_id_to_notifications_log.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/016_add_user_id_to_notifications_log.sql || echo "⚠️  Migration 16 already applied or failed"

echo "Migration 17/19: 017_add_username_to_tables.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/017_add_username_to_tables.sql || echo "⚠️  Migration 17 already applied or failed"

echo "Migration 18/19: 018_populate_username_from_user_id.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/018_populate_username_from_user_id.sql || echo "⚠️  Migration 18 already applied or failed"

echo "Migration 19/19: 019_make_username_required.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/019_make_username_required.sql || echo "⚠️  Migration 19 already applied or failed"

echo "Migration 20/21: 020_remove_target_from_alerts.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/020_remove_target_from_alerts.sql || echo "⚠️  Migration 20 already applied or failed"

echo "Migration 21/23: 021_fix_user_push_tokens_username.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/021_fix_user_push_tokens_username.sql || echo "⚠️  Migration 21 already applied or failed"

echo "Migration 22/23: 022_create_devices_and_device_push_tokens.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/022_create_devices_and_device_push_tokens.sql || echo "⚠️  Migration 22 already applied or failed"

echo "Migration 23/24: 023_migrate_user_push_tokens_to_devices.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/023_migrate_user_push_tokens_to_devices.sql || echo "⚠️  Migration 23 already applied or failed"

echo "Migration 24/29: 024_create_common_stocks.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/024_create_common_stocks.sql || echo "⚠️  Migration 24 already applied or failed"

echo "Migration 25/29: 025_create_senate_trades.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/025_create_senate_trades.sql || echo "⚠️  Migration 25 already applied or failed"

echo "Migration 26/29: 026_create_user_senator_follows.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/026_create_user_senator_follows.sql || echo "⚠️  Migration 26 already applied or failed"

echo "Migration 27/29: 027_add_senator_alert_preferences.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/027_add_senator_alert_preferences.sql || echo "⚠️  Migration 27 already applied or failed"

echo "Migration 28/29: 028_create_datalake_tables.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/028_create_datalake_tables.sql || echo "⚠️  Migration 28 already applied or failed"

echo "Migration 29/30: 029_seed_datalake_data.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/029_seed_datalake_data.sql || echo "⚠️  Migration 29 already applied or failed"

echo "Migration 30/30: 030_create_house_trades.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/030_create_house_trades.sql || echo "⚠️  Migration 30 already applied or failed"

echo ""
echo "✅ Database migrations complete"
echo ""

echo "🔨 Building and Deploying API..."
echo "------------------------------------------------"

# Non-interactive deployment
wrangler deploy

echo ""
echo "✅ API Deployment Complete"
echo "🌐 API URL: https://stockly-api.ahmednasser1993.workers.dev"
echo ""
