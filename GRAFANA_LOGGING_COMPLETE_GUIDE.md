# Grafana Cloud & Loki Logging - Complete Guide

Complete guide for Grafana Cloud Loki logging setup and usage in the Stockly API.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Credentials & Configuration](#credentials--configuration)
3. [Structured Logging System](#structured-logging-system)
4. [Grafana Setup](#grafana-setup)
5. [Finding & Querying Logs](#finding--querying-logs)
6. [Usage Examples](#usage-examples)
7. [Troubleshooting](#troubleshooting)
8. [Testing](#testing)

---

## Quick Start

**Credentials:**
- **URL**: `https://logs-prod-035.grafana.net`
- **Username**: `1420483`
- **Password**: `your_grafana_cloud_api_token_here`

**Setup:**
1. **Local**: Create `.dev.vars` with `LOKI_URL`, `LOKI_USERNAME`, `LOKI_PASSWORD`
2. **Production**: `wrangler secret put LOKI_URL` (and USERNAME, PASSWORD)
3. **Grafana**: Explore → Use pre-configured "Grafana Cloud Logs" or manually configure Loki data source

**Test:**
```bash
./scripts/test-loki-connection.sh  # Should show HTTP 204
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/health
# Wait 10-30s, then query in Grafana: {service="stockly-api"}
```

---

## Credentials & Configuration

### Loki Credentials

**Instance ID**: `1420483`  
**API Token**: `your_grafana_cloud_api_token_here`

**Endpoints:**
- **Loki Push**: `https://logs-prod-035.grafana.net/loki/api/v1/push`
- **Loki Base**: `https://logs-prod-035.grafana.net`
- **Prometheus**: `https://prometheus-prod-55-prod-gb-south-1.grafana.net/api/prom/push` (ID: `2849613`)

### Environment Configuration

**Local (`.dev.vars`):**
```bash
LOKI_URL=https://logs-prod-035.grafana.net
LOKI_USERNAME=1420483
LOKI_PASSWORD=your_grafana_cloud_api_token_here
```

**Production:**
```bash
wrangler secret put LOKI_URL      # https://logs-prod-035.grafana.net
wrangler secret put LOKI_USERNAME # 1420483
wrangler secret put LOKI_PASSWORD # [API token]
wrangler secret list              # Verify all three are set
```

**Note:** Loki is optional. Without it, logs still work via console (`wrangler tail`).

### Alloy Configuration (Server-Side)

For server-side log collection, see the full Alloy configuration script in the original file or Grafana Cloud portal.

---

## Structured Logging System

### Overview

- **Structured JSON logs** with consistent fields
- **Automatic D1/KV logging** with latency and cache status
- **FCM error logging** with full context
- **Optional Loki shipping** (works without Loki - logs go to console)

### Architecture

**Components:**
1. **Logger** (`src/logging/logger.ts`) - Creates structured JSON logs, maintains buffer per request
2. **Loki Shipper** (`src/logging/loki-shipper.ts`) - Ships logs asynchronously via `waitUntil()`
3. **D1 Wrapper** (`src/logging/d1-wrapper.ts`) - Auto-logs all D1 operations with latency
4. **KV Wrapper** (`src/logging/kv-wrapper.ts`) - Auto-logs KV operations with cache status

**Request Lifecycle:**
1. Request starts → TraceId generated, logger created
2. Logs buffered in memory during processing
3. Response sent immediately
4. Logs shipped asynchronously (non-blocking)

**Automatic Logging:**
- All D1 operations (`prepare`, `first`, `all`, `run`, `exec`, `batch`)
- All KV operations (`get`, `put`, `delete`, `list`) with HIT/MISS status
- FCM push notification failures (when using `sendFCMNotificationWithLogs`)

### Log Entry Structure

**Base fields:**
```json
{
  "timestamp": "2025-12-08T10:30:00Z",
  "service": "stockly-api",
  "level": "INFO|DEBUG|WARN|ERROR",
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user123",
  "path": "/v1/api/alerts/list",
  "message": "Fetched alerts from D1."
}
```

**Additional fields by type:**
- **API calls**: `type: "api_call"`, `apiProvider`, `endpoint`, `method`, `statusCode`, `latencyMs`
- **Data operations**: `type: "data_operation"`, `operation: "d1|kv"`, `query`, `latencyMs`, `cacheStatus`
- **FCM errors**: `type: "fcm_error"`, `fcmErrorCode`, `fcmErrorType`, `isPermanent`, `shouldCleanupToken`, `requestPayload`, `errorMessage`

---

## Grafana Setup

### Method 1: Pre-configured (Easiest)

1. Go to **Explore** → Check data source dropdown
2. Look for **"Grafana Cloud Logs"**, **"Loki (Cloud)"**, or **"Logs"** (cloud icon)
3. Select it → Query `{}` → Time: **Last 1 hour**

**Most Grafana Cloud accounts have this pre-configured!**

### Method 2: Manual Configuration

1. **Configuration** → **Data sources** → **Add data source** → **Loki**
2. **Settings:**
   - **URL**: `https://logs-prod-035.grafana.net` (must include `https://`, no trailing slash)
   - **Basic Auth**: ✅ Enable
   - **User**: `1420483`
   - **Password**: `your_grafana_cloud_api_token_here`
   - **HTTP Method**: `POST` (optional)
   - **Timeout**: `60` seconds
3. **Save & test** → Should see ✅ "Data source is working"

**Alternative URLs** (if first doesn't work):
- `https://logs-prod-035.grafana.net/loki`
- Check Grafana Cloud Portal → My Account → Cloud Portal → Logs → Query URL

---

## Finding & Querying Logs

### Quick Start

1. **Grafana** → **Explore** → Select **Loki** data source
2. **Time range**: **Last 15 minutes** (or includes when logs were sent)
3. **Query**: `{service="stockly-api"}`
4. **Run query**

### Common Queries

```logql
# All logs from service
{service="stockly-api"}

# Errors only
{service="stockly-api", level="ERROR"}

# Search in content
{service="stockly-api"} |= "error"

# By path
{service="stockly-api", path="/v1/api/health"}

# Cron jobs
{service="stockly-api", path="/cron/alerts"}

# View formatted messages
{service="stockly-api"} | json | line_format "{{.message}}"

# Filter by log level
{service="stockly-api"} | json | level="ERROR"
```

### Troubleshooting "No Data Found"

1. ✅ **Expand time range** - Try "Last 1 hour" or "Last 6 hours"
2. ✅ **Use broadest query** - Start with `{}` (all logs)
3. ✅ **Wait 10-30 seconds** - Logs need indexing time
4. ✅ **Verify logs sent** - Run `./scripts/test-loki-connection.sh` (should show HTTP 204)
5. ✅ **Check label browser** - Click "service" label to see available values

**Expected timeline:**
- 0s: Request made
- 0-2s: Logs shipped to Loki (async)
- 10-30s: Logs indexed
- 30s+: Logs appear in queries

---

## Usage Examples

### Basic Handler

```typescript
export async function myHandler(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  logger.info("Processing request");
  
  // D1/KV operations automatically logged
  const result = await env.stockly.prepare("SELECT * FROM table").first();
  const cached = await env.alertsKv?.get("key");
  
  return json(result);
}
```

### Logging API Calls

```typescript
const startTime = Date.now();
const response = await fetch("https://api.example.com/data");
logger.logApiCall("External API call", {
  apiProvider: "ExampleAPI",
  endpoint: "/data",
  method: "GET",
  statusCode: response.status,
  latencyMs: Date.now() - startTime,
});
```

### Error Handling

```typescript
try {
  // Operation
} catch (error) {
  logger.error("Operation failed", error, { userId, context: "details" });
}
```

### Log Levels

- **DEBUG**: Detailed debugging (API calls, cache hits)
- **INFO**: General messages, successful operations
- **WARN**: Recoverable errors, fallbacks, 404s
- **ERROR**: Application errors, failures, exceptions

**Best Practices:**
- Include context: `logger.info("User action", { userId, action, alertId })`
- Let automatic logging handle D1/KV operations
- Always pass `logger` to `sendFCMNotificationWithLogs()` for error logging

---

## Troubleshooting

### "Unable to connect with Loki"

**Check:**
1. ✅ URL format: `https://logs-prod-035.grafana.net` (not `logs-prod-035.grafana.net` or with trailing slash)
2. ✅ Basic Auth enabled (not OAuth)
3. ✅ Username: `1420483` (exact, no spaces)
4. ✅ Password copied exactly (no extra spaces)
5. ✅ Try alternative URLs: `/loki` variant or check Grafana Cloud portal

**Advanced settings:**
- HTTP Method: `GET` or `POST`
- Timeout: `60` seconds

### "unsupported protocol scheme"

- URL field is empty or missing `https://`
- Set URL to: `https://logs-prod-035.grafana.net`
- Click "Save & test"

### Logs Not Appearing

**Verify:**
```bash
# Check local config
cat .dev.vars | grep LOKI_URL

# Check production secrets
wrangler secret list  # Should show LOKI_URL, LOKI_USERNAME, LOKI_PASSWORD

# Test connection
./scripts/test-loki-connection.sh  # Should show HTTP 204

# Test direct API query
source .dev.vars
END=$(date +%s)
START=$((END - 3600))
curl -s -u "$LOKI_USERNAME:$LOKI_PASSWORD" \
  "https://logs-prod-035.grafana.net/loki/api/v1/query_range?query={}&start=${START}000000000&end=${END}000000000&limit=1" | jq .
```

**Common issues:**
- Time range too narrow → Expand to "Last 1 hour"
- Wrong Grafana instance → Verify correct account
- Logs not indexed yet → Wait 30 seconds
- Query syntax error → Use `{service="stockly-api"}` (double quotes, not single)

### Verification Checklist

- [ ] Grafana Explore → Loki selected
- [ ] Time range includes when logs were sent
- [ ] Query: `{service="stockly-api"}` (correct syntax)
- [ ] Test log sent successfully (HTTP 204)
- [ ] Waited 10-30 seconds after sending
- [ ] Tried broadest query: `{}`
- [ ] URL starts with `https://`, no trailing slash
- [ ] Basic Auth enabled with correct credentials

---

## Testing

### Quick Test

```bash
# 1. Send test log
./scripts/test-loki-connection.sh  # Should show: ✓ Connection successful! (HTTP 204)

# 2. Wait 30 seconds

# 3. In Grafana:
#    - Explore → Loki
#    - Time: Last 15 minutes
#    - Query: {}
#    - If logs appear, try: {service="stockly-api"}
```

### Test Endpoints

```bash
# Health check
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/health

# Generate API call logs
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stock?symbol=AAPL"

# Generate D1 operation logs
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/search-stock?query=apple"
```

### Expected Results

✅ **Success:**
- Log entries with timestamps
- JSON content when expanded
- Labels: `service="stockly-api"`
- Fields: `timestamp`, `level`, `traceId`, `message`, `path`

❌ **No logs:**
- "No data found" (but no connection errors)
- Check time range and query syntax

---

## Logging Status

### ✅ Working Well

- Logger implementation with proper log levels
- Loki integration (async, non-blocking)
- Automatic D1/KV operation logging
- Critical paths logged: main handler, alerts, stock fetching, FCM, cron jobs

### ⚠️ Low Priority

- ~15 API endpoint files still use `console.*` instead of logger
- Mostly in error handlers that already return proper HTTP responses
- Functionality not affected, can be improved incrementally

**Status**: ✅ **Production Ready** - Critical paths properly logged, Loki integration working.

---

## Updating Secrets

```bash
# Update production secrets
wrangler secret put LOKI_URL      # https://logs-prod-035.grafana.net
wrangler secret put LOKI_USERNAME # 1420483
wrangler secret put LOKI_PASSWORD # [new API token]

# Verify
wrangler secret list

# Test after update
curl https://your-worker.workers.dev/v1/api/health
# Wait 10-30s, check Grafana: {service="stockly-api"}
```

**How it works:**
- Code checks `env.LOKI_URL` before shipping
- If not set, logs still created (console only)
- Logs shipped asynchronously (non-blocking)
- All logs buffered per request and shipped together

---

## Summary

**For Pushing Logs:**
- URL: `https://logs-prod-035.grafana.net`
- Endpoint: `https://logs-prod-035.grafana.net/loki/api/v1/push`
- Username: `1420483`
- Password: `your_grafana_cloud_api_token_here`

**For Grafana Data Source:**
- URL: `https://logs-prod-035.grafana.net` (or `/loki` variant)
- Basic Auth: Enabled
- Username: `1420483`
- Password: `your_grafana_cloud_api_token_here`
- HTTP Method: `POST` (or `GET`)
- Timeout: `60` seconds

**Most Common Solution:** Use pre-configured "Grafana Cloud Logs" data source in Explore dropdown.
