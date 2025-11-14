# Stockly API - Production Deployment Guide

## 📋 Pre-Deployment Checklist

Before deploying, you need to:
1. ✅ Create KV namespace for alerts state
2. ✅ Update wrangler.jsonc with KV and cron config
3. ✅ Run database migrations
4. ✅ Run tests locally
5. ✅ Deploy worker
6. ✅ Verify endpoints

---

## Step 1: Create KV Namespace

Run this command to create the KV namespace for alert state management:

```bash
wrangler kv namespace create "alertsKv"
```

**Output will look like:**
```
🌀 Creating namespace with title "stockly-api-alertsKv"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "alertsKv", id = "abc123def456..." }
```

**Copy the ID from the output** - you'll need it in the next step.

---

## Step 2: Update wrangler.jsonc

Add the KV namespace and cron trigger to your `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "stockly-api",
  "main": "src/index.ts",
  "compatibility_date": "2025-11-13",
  "observability": {
    "enabled": true
  },
  "d1_databases": [
    {
      "binding": "stockly",
      "database_name": "stockly",
      "database_id": "d234268d-d8f1-49d2-9643-6a1d5bf0a589",
      "remote": true
    }
  ],
  "kv_namespaces": [
    {
      "binding": "alertsKv",
      "id": "YOUR_KV_NAMESPACE_ID_HERE"
    }
  ],
  "triggers": {
    "crons": ["*/5 * * * *"]
  }
}
```

**Replace `YOUR_KV_NAMESPACE_ID_HERE`** with the ID from Step 1.

**Cron Schedule Explanation:**
- `*/5 * * * *` = Every 5 minutes
- Alternatives:
  - `*/15 * * * *` = Every 15 minutes
  - `0 * * * *` = Every hour
  - `0 */4 * * *` = Every 4 hours

---

## Step 3: Run Database Migrations

Apply the new `003_create_alerts.sql` migration to production:

```bash
npm run db:migrate:production
```

**Or directly:**
```bash
wrangler d1 migrations apply stockly --remote
```

**Expected output:**
```
🌀 Executing on remote database stockly (d234268d-d8f1-49d2-9643-6a1d5bf0a589):
🌀 To execute on your local development database, remove the --remote flag from your wrangler command.
🚣 Executing migration 003_create_alerts.sql...
✅ Successfully applied 1 migration
```

---

## Step 4: Run Tests

Make sure everything passes locally:

```bash
npm test
```

All tests should pass (existing + new alerts tests).

---

## Step 5: Deploy

Deploy the worker to production:

```bash
npm run deploy
```

**Or:**
```bash
wrangler deploy
```

**Expected output:**
```
⛅️ wrangler 4.48.0
------------------
Total Upload: XX.XX KiB / gzip: XX.XX KiB
Uploaded stockly-api (X.XX sec)
Published stockly-api (X.XX sec)
  https://stockly-api.ahmednasser1993.workers.dev
Current Deployment ID: xxxx-xxxx-xxxx
```

---

## Step 6: Verify Deployment

### Test Health Check
```bash
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/health
```

Expected: `{"status":"ok"}`

### Test Existing Endpoints (Backward Compatibility)
```bash
# Get stock quote
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stock?symbol=AAPL"

# Search stocks
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/search-stock?query=APP"

# Get multiple stocks
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stocks?symbols=AAPL,MSFT,GOOGL"
```

### Test New Alerts Endpoints
```bash
# List alerts (should be empty initially)
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts

# Create an alert
curl -X POST https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "direction": "above",
    "threshold": 200,
    "channel": "email",
    "target": "test@example.com",
    "notes": "Test alert"
  }'

# List alerts again (should show the created alert)
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts

# Update alert (replace {id} with actual ID from create response)
curl -X PUT https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts/{id} \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'

# Delete alert
curl -X DELETE https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts/{id}
```

---

## Step 7: Monitor Cron Job

Check if the cron job is running:

```bash
wrangler tail
```

**Look for logs every 5 minutes:**
- If there are active alerts, you'll see: `ALERT_TRIGGERED` logs
- If no alerts or no price changes: No logs (normal)

---

## 🔍 Database Inspection

### Check alerts table
```bash
wrangler d1 execute stockly --remote \
  --command="SELECT * FROM alerts ORDER BY created_at DESC LIMIT 10;"
```

### Check stock prices
```bash
npm run prod:select-prices
```

### Check search cache
```bash
npm run prod:select-search
```

---

## 🐛 Troubleshooting

### Issue: "KV binding not found"
**Solution:** Make sure you added the KV namespace to `wrangler.jsonc` and redeployed.

### Issue: "Table alerts does not exist"
**Solution:** Run migrations: `npm run db:migrate:production`

### Issue: Cron job not running
**Solution:** 
1. Check `wrangler.jsonc` has `triggers.crons`
2. Redeploy after adding cron config
3. Wait 5 minutes for first run
4. Check logs: `wrangler tail`

### Issue: 404 on /v1/api/alerts
**Solution:** Make sure you deployed the latest code. Check routing in `src/index.ts`.

---

## 🔄 Rollback (If Needed)

If something goes wrong, you can rollback:

```bash
# List deployments
wrangler deployments list

# Rollback to previous version
wrangler rollback [deployment-id]
```

---

## 📊 Monitor Production

### View Real-time Logs
```bash
wrangler tail
```

### View in Cloudflare Dashboard
1. Go to https://dash.cloudflare.com
2. Select Workers & Pages
3. Click on "stockly-api"
4. View metrics, logs, and analytics

---

## ⚙️ Optional: Configure Secrets

If you need to update the docs authentication:

```bash
wrangler secret put DOCS_USER
wrangler secret put DOCS_PASS
```

---

## ✅ Post-Deployment Checklist

- [ ] Health check returns OK
- [ ] Existing stock endpoints work
- [ ] Can list alerts (empty or with data)
- [ ] Can create alert
- [ ] Can update alert
- [ ] Can delete alert
- [ ] Cron job appears in logs
- [ ] Database has alerts table
- [ ] KV namespace is accessible

---

## 🚀 You're Live!

Your API is now deployed with full alerts support at:

**https://stockly-api.ahmednasser1993.workers.dev**

Share these endpoints with your webapp and mobile app teams! 🎉

