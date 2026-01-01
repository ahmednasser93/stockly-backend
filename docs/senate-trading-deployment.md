# Senate Trading Feature - Configuration & Deployment Guide

This document describes how to configure and deploy the Senate Trading feature.

---

## Prerequisites

1. **Database Migrations**: Ensure all required migrations have been applied
2. **FMP API Key**: A valid Financial Modeling Prep API key
3. **Cloudflare Workers**: Access to deploy the updated API

---

## Database Migrations

The Senate Trading feature requires three database migrations:

### Migration 025: Create Senate Trades Table
**File**: `api/migrations/025_create_senate_trades.sql`

Creates the `senate_trades` table to store trading disclosures.

### Migration 026: Create User Senator Follows Table
**File**: `api/migrations/026_create_user_senator_follows.sql`

Creates the `user_senator_follows` table to track which senators users are following.

### Migration 027: Add Senator Alert Preferences
**File**: `api/migrations/027_add_senator_alert_preferences.sql`

Adds three new columns to `user_notification_preferences`:
- `senator_alerts_enabled` (INTEGER, default: 1)
- `senator_alert_holdings_only` (INTEGER, default: 0)
- `senator_alert_followed_only` (INTEGER, default: 0)

---

## Running Migrations

### Local Development

```bash
cd api
npx wrangler d1 migrations apply stockly --local
```

This applies all pending migrations to your local D1 database.

### Production

```bash
cd api
npx wrangler d1 migrations apply stockly --remote
```

**⚠️ Important**: Always test migrations locally before applying to production.

### Verify Migrations

After running migrations, verify the tables exist:

```bash
# Local
npx wrangler d1 execute stockly --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%senate%' OR name LIKE '%senator%';"

# Production
npx wrangler d1 execute stockly --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%senate%' OR name LIKE '%senator%';"
```

Expected tables:
- `senate_trades`
- `user_senator_follows`

And verify the new columns in `user_notification_preferences`:

```bash
npx wrangler d1 execute stockly --remote --command "PRAGMA table_info(user_notification_preferences);"
```

---

## Cron Job Configuration

The Senate Trading feature uses a cron job to periodically sync data from the FMP API and evaluate alerts.

### Current Configuration

**File**: `api/wrangler.jsonc`

```jsonc
"triggers": {
  "crons": ["0 * * * *", "*/5 * * * *", "0 */6 * * *"]
}
```

The third cron trigger (`0 */6 * * *`) runs the senate trading sync every 6 hours at:
- 00:00 UTC
- 06:00 UTC
- 12:00 UTC
- 18:00 UTC

### Customizing the Schedule

To change the frequency, modify the cron expression in `wrangler.jsonc`:

**Examples**:
- Every 3 hours: `"0 */3 * * *"`
- Every 12 hours: `"0 */12 * * *"`
- Daily at midnight: `"0 0 * * *"`
- Twice daily (6am and 6pm): `"0 6,18 * * *"`

**Cron Format**: `minute hour day month weekday`

After changing the cron schedule, redeploy the worker:

```bash
cd api
npm run deploy
```

### Environment Variable Configuration (Optional)

If you want to make the cron schedule configurable via environment variable, you would need to:

1. Add the cron schedule to environment variables
2. Modify the `scheduled` handler in `api/src/index.ts` to read from environment
3. Update `wrangler.jsonc` to use the environment variable

**Note**: Cloudflare Workers cron triggers are defined in `wrangler.jsonc` and cannot be dynamically changed at runtime. To change the schedule, you must update the configuration file and redeploy.

---

## FMP API Configuration

### Setting the API Key

The feature uses the FMP API key from environment variables:

**Production**:
```bash
npx wrangler secret put FMP_API_KEY
```

**Local Development**:
Add to `.dev.vars` file:
```
FMP_API_KEY=your_api_key_here
```

### API Endpoint

The feature uses the following FMP endpoints:
- `GET /v4/senate-trading?apikey={key}&symbol={symbol}` - Fetch trades by symbol
- `GET /v4/senate-trading?apikey={key}` - Fetch all recent trades

**Base URL**: Defined in `api/src/util.ts` as `API_URL`

---

## Deployment Steps

### 1. Apply Database Migrations

```bash
# Test locally first
cd api
npx wrangler d1 migrations apply stockly --local

# Then apply to production
npx wrangler d1 migrations apply stockly --remote
```

### 2. Verify Environment Variables

Ensure `FMP_API_KEY` is set:

```bash
npx wrangler secret list
```

### 3. Build and Deploy

```bash
cd api
npm run build
npm run deploy
```

Or use the deploy script:

```bash
npm run deploy
```

### 4. Verify Deployment

Check that the cron job is registered:

```bash
npx wrangler deployments list
```

Check the worker logs to see if the cron job runs:

```bash
npx wrangler tail
```

Wait for the next cron trigger time and verify logs show:
- Senate trading data sync
- Alert evaluation

---

## Monitoring

### Logs

Monitor the cron job execution:

```bash
npx wrangler tail --format pretty
```

Look for log messages:
- `[fetchSenateTradingFromFmp]` - FMP API calls
- `[upsertTrade]` - Database operations
- `[evaluateSenatorAlerts]` - Alert evaluation

### Database Queries

Check recent trades:

```bash
npx wrangler d1 execute stockly --remote --command "SELECT COUNT(*) as count FROM senate_trades;"
```

Check user follows:

```bash
npx wrangler d1 execute stockly --remote --command "SELECT COUNT(*) as count FROM user_senator_follows;"
```

### Error Monitoring

Monitor for:
- FMP API rate limiting (429 errors)
- Network timeouts
- Database constraint violations
- Missing API keys

---

## Troubleshooting

### Migration Errors

**Error**: `Migration failed: table already exists`

**Solution**: The migration may have already been applied. Check migration status:

```bash
npx wrangler d1 migrations list stockly --remote
```

### Cron Job Not Running

**Check**:
1. Verify cron schedule in `wrangler.jsonc`
2. Check deployment status
3. Review worker logs for errors
4. Ensure the `scheduled` handler is properly registered in `api/src/index.ts`

### FMP API Errors

**Rate Limiting (429)**:
- The cron job handles rate limits gracefully
- Consider reducing cron frequency if rate limits are hit frequently

**Authentication Errors (401/403)**:
- Verify `FMP_API_KEY` is set correctly
- Check API key permissions in FMP dashboard

### Database Errors

**Constraint Violations**:
- These are handled gracefully (duplicate trades are skipped)
- Check logs for validation errors

---

## Rollback

If you need to rollback the feature:

### 1. Disable Cron Job

Comment out or remove the senate trading cron handler in `api/src/index.ts`:

```typescript
// if (event.cron === "0 */6 * * *") {
//   ctx.waitUntil(runSenateTradingCron(env, ctx));
// }
```

### 2. Redeploy

```bash
npm run deploy
```

### 3. (Optional) Drop Tables

**⚠️ Warning**: This will delete all senate trading data!

```bash
npx wrangler d1 execute stockly --remote --command "DROP TABLE IF EXISTS senate_trades;"
npx wrangler d1 execute stockly --remote --command "DROP TABLE IF EXISTS user_senator_follows;"
```

**Note**: The `user_notification_preferences` columns added by migration 027 can remain as they don't affect existing functionality.

---

## Performance Considerations

### Database Indexes

The migrations create indexes on:
- `senate_trades.symbol`
- `senate_trades.senator_name`
- `senate_trades.disclosure_date`
- `senate_trades.transaction_type`
- `senate_trades.fmp_id` (unique)
- `user_senator_follows.user_id`
- `user_senator_follows.senator_name`

These indexes ensure efficient queries even with large datasets.

### Cron Job Performance

The cron job:
1. Fetches up to 100 trades from FMP API (configurable)
2. Upserts trades (deduplicated by `fmp_id`)
3. Evaluates alerts for all users

**Estimated Runtime**: 10-30 seconds depending on:
- Number of new trades
- Number of users
- Number of favorite stocks and follows

If runtime exceeds Cloudflare Workers limits (30 seconds for free tier), consider:
- Reducing the number of trades fetched per run
- Batching alert evaluation
- Using Cloudflare Queues for async processing

---

## Security Considerations

1. **API Keys**: Store `FMP_API_KEY` as a secret, never commit to version control
2. **Authentication**: All user-specific endpoints require JWT authentication
3. **Input Validation**: All user inputs are validated and sanitized
4. **Rate Limiting**: FMP API rate limits are handled gracefully

---

## Support

For issues or questions:
1. Check the API documentation: `api/docs/senate-trading-api.md`
2. Review worker logs: `npx wrangler tail`
3. Verify database state: Run diagnostic queries above


