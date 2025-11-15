#!/bin/bash

# ==============================================================================
# Stockly API Production Deployment Script
# ==============================================================================
# Runs all database migrations and deploys the API
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

# Run migrations in order
echo "Migration 1/6: 001_init.sql"
wrangler d1 execute stockly --remote --file=./migrations/001_init.sql || echo "⚠️  Migration 1 already applied or failed"

echo "Migration 2/6: 002_add_search_cache.sql"
wrangler d1 execute stockly --remote --file=./migrations/002_add_search_cache.sql || echo "⚠️  Migration 2 already applied or failed"

echo "Migration 3/6: 003_create_alerts.sql"
wrangler d1 execute stockly --remote --file=./migrations/003_create_alerts.sql || echo "⚠️  Migration 3 already applied or failed"

echo "Migration 4/6: 004_create_user_push_tokens.sql"
wrangler d1 execute stockly --remote --file=./migrations/004_create_user_push_tokens.sql || echo "⚠️  Migration 4 already applied or failed"

echo "Migration 5/6: 005_create_notification_preferences.sql"
wrangler d1 execute stockly --remote --file=./migrations/005_create_notification_preferences.sql || echo "⚠️  Migration 5 already applied or failed"

echo "Migration 6/8: 006_create_notifications_log.sql"
wrangler d1 execute stockly --remote --file=./migrations/006_create_notifications_log.sql || echo "⚠️  Migration 6 already applied or failed"

echo "Migration 7/8: 007_create_user_settings.sql"
wrangler d1 execute stockly --remote --file=./migrations/007_create_user_settings.sql || echo "⚠️  Migration 7 already applied or failed"

echo "Migration 8/8: 008_create_historical_prices.sql"
wrangler d1 execute stockly --remote --file=./migrations/008_create_historical_prices.sql || echo "⚠️  Migration 8 already applied or failed"

echo ""
echo "✅ Database migrations complete"
echo ""

echo "🔨 Building and Deploying API..."
echo "------------------------------------------------"
wrangler deploy

echo ""
echo "✅ API Deployment Complete"
echo "🌐 API URL: https://stockly-api.ahmednasser1993.workers.dev"
echo ""

