#!/bin/bash

# ==============================================================================
# Stockly API Production Deployment Script
# ==============================================================================
# Runs all database migrations and deploys the API (non-interactive)
# ==============================================================================
# NOTE: This script is kept for backward compatibility.
#       For unified deployment (API + Webapp), use: ../../scripts/deploy-prod.sh
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"

cd "$API_DIR"

echo "🚀 Deploying Stockly API to Production"
echo "================================================"
echo ""

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

echo "Migration 12/12: 012_create_users.sql"
wrangler d1 execute stockly --remote --yes --file=./migrations/012_create_users.sql || echo "⚠️  Migration 12 already applied or failed"

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
