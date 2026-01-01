# Datalake Abstraction System - Deployment Guide

## Overview

This guide covers the deployment steps for the datalake abstraction system, including database migrations, environment configuration, and testing.

## Prerequisites

1. Cloudflare Workers CLI (`wrangler`) installed and authenticated
2. Access to the D1 database (`stockly`)
3. Backend environment variables configured
4. Mobile app build configuration ready

## Step 1: Database Migrations

The datalake system requires two new database migrations:

### Migration 28: Create Datalake Tables
**File**: `api/migrations/028_create_datalake_tables.sql`

Creates the following tables:
- `datalakes` - Stores datalake configurations
- `api_endpoints` - Stores API endpoint definitions
- `datalake_api_mappings` - Maps endpoints to datalakes

### Migration 29: Seed Initial Data
**File**: `api/migrations/029_seed_datalake_data.sql`

Seeds the database with:
- Default FMP datalake configuration
- All 31 API endpoints from FMP documentation
- Default mappings (all endpoints mapped to FMP)

### Running Migrations

**Local Development:**
```bash
cd api
npm run db:migrate:local
```

**Production:**
```bash
cd api
npm run db:migrate:production
```

Or run individually:
```bash
wrangler d1 execute stockly --remote --yes --file=./migrations/028_create_datalake_tables.sql
wrangler d1 execute stockly --remote --yes --file=./migrations/029_seed_datalake_data.sql
```

### Verify Migrations

After running migrations, verify the tables exist:
```bash
wrangler d1 execute stockly --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('datalakes', 'api_endpoints', 'datalake_api_mappings');"
```

## Step 2: Backend Environment Configuration

### Set Mobile App API Key

1. Generate an API key using the provided script:
```bash
cd api
npx tsx scripts/generate-mobile-api-key.ts
```

2. Set the secret in Cloudflare Workers:
```bash
wrangler secret put MOBILE_APP_API_KEY
# Paste the generated API key when prompted
```

3. Verify the secret is set:
```bash
wrangler secret list
```

### Configure Allowed Webapp Origins

The client authentication middleware allows these origins by default:
- `https://stockly-webapp.pages.dev` (production)
- `http://localhost:5173` (local dev)
- `http://localhost:5174` (alternate local dev)
- `http://localhost:3000` (alternate local dev)

To add more origins, edit `api/src/index.ts` and update the `allowedWebappOrigins` array.

## Step 3: Mobile App Configuration

### Set API Key in Build Configuration

The mobile app needs the API key at build time. Configure it using one of these methods:

**Method 1: Build-time flag (Recommended)**
```bash
flutter run --dart-define=MOBILE_APP_API_KEY=your_generated_key_here
```

**Method 2: Build configuration file**
Create or update your build configuration to include:
```dart
--dart-define=MOBILE_APP_API_KEY=your_generated_key_here
```

**Method 3: Environment file (for CI/CD)**
Store the API key securely in your CI/CD environment variables and pass it during build.

### Verify Mobile App Configuration

After building, check the logs to ensure the API key is being sent:
- Look for: `🔐 _AuthInterceptor -> Added X-Client-API-Key header`
- If you see: `⚠️ MOBILE_APP_API_KEY not set`, the key is not configured correctly

## Step 4: Testing

### Test Client Authentication

**Test Webapp Access:**
1. Open webapp in browser (should work automatically via Origin header)
2. Check browser console for any 403 errors
3. Verify API calls succeed

**Test Mobile App Access:**
1. Build mobile app with API key configured
2. Make an API request
3. Verify request succeeds (not 403)

**Test Unauthorized Access:**
1. Make a request without Origin header and without X-Client-API-Key header
2. Should receive 403 Forbidden response
3. Response body: `{ "error": "Forbidden", "message": "Client authentication required" }`

### Test Datalake Management

**Via Webapp:**
1. Navigate to `/admin/datalakes`
2. Verify FMP datalake is listed
3. Verify all API endpoints are listed
4. Test onboarding a new datalake
5. Test selecting a different datalake for an endpoint

**Via API:**
```bash
# List all datalakes
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://stockly-api.ahmednasser1993.workers.dev/v1/api/admin/datalakes

# List all API endpoints
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://stockly-api.ahmednasser1993.workers.dev/v1/api/admin/api-endpoints
```

## Step 5: Deployment Checklist

- [ ] Database migrations 028 and 029 applied (local and production)
- [ ] `MOBILE_APP_API_KEY` secret set in Cloudflare Workers
- [ ] Mobile app configured with API key
- [ ] Webapp origins verified in `allowedWebappOrigins`
- [ ] Client authentication tested (webapp and mobile)
- [ ] Unauthorized access returns 403
- [ ] Datalake management UI accessible at `/admin/datalakes`
- [ ] Can onboard new datalake via webapp
- [ ] Can select datalake per endpoint via webapp
- [ ] All existing API functionality still works

## Troubleshooting

### 403 Forbidden Errors

**Webapp:**
- Check that the Origin header matches an allowed origin
- Verify CORS is configured correctly
- Check browser console for CORS errors

**Mobile App:**
- Verify `MOBILE_APP_API_KEY` is set in build configuration
- Check logs for: `Added X-Client-API-Key header`
- Verify the API key matches the backend secret
- Check that the header name is exactly `X-Client-API-Key`

### Database Migration Errors

- Ensure migrations are run in order
- Check that previous migrations (001-027) are applied
- Verify D1 database connection
- Check migration file syntax

### Datalake Not Appearing

- Verify migration 029 (seed data) ran successfully
- Check database for `fmp-default` datalake:
  ```sql
  SELECT * FROM datalakes WHERE id = 'fmp-default';
  ```
- Verify API endpoints were created:
  ```sql
  SELECT COUNT(*) FROM api_endpoints;
  ```

## Next Steps

1. **Repository Refactoring** (Optional, Incremental):
   - Gradually migrate repositories to use `DatalakeAdapter` pattern
   - Start with one repository as a proof of concept
   - Test thoroughly before migrating others

2. **Monitoring**:
   - Add logging for datalake request routing
   - Track datalake performance metrics
   - Monitor error rates per datalake

3. **Fallback Strategy**:
   - Implement automatic fallback to FMP if selected datalake fails
   - Add retry logic with exponential backoff
   - Consider circuit breaker pattern for unreliable datalakes

## Support

For issues or questions:
1. Check logs in Grafana Loki (if configured)
2. Review Cloudflare Workers logs
3. Check database state using wrangler commands
4. Verify environment variables and secrets

