# Stockly API - Command Reference

Quick reference for all common commands and scripts.

---

## Development

### Start Local Server
```bash
npm run dev
```
- Applies local migrations
- Starts wrangler dev server
- Persists D1 to `.wrangler/state`
- Available at: `http://localhost:8787`

### Start Without Migration
```bash
npm start
```
- Skips migration step
- Faster for quick restarts

### Watch Tests
```bash
npm test -- --watch
```
- Runs tests in watch mode
- Reruns on file changes

---

## Testing

### Run All Tests
```bash
npm test
```
- Runs all 44 tests
- 10 test files
- Uses Vitest with Workers runtime

### Run Specific Test File
```bash
npm test alerts-evaluate.spec.ts
```

### Generate Type Definitions
```bash
npm run cf-typegen
```
- Creates `worker-configuration.d.ts`
- Type hints for env bindings

---

## Database

### Local Development

#### Apply Migrations
```bash
npm run db:migrate:local
```
- Applies all pending migrations
- Creates `.wrangler/state/v3/d1` folder

#### Query Stock Prices
```bash
npm run select-prices
```
- Shows last 20 cached prices

#### Query Search Cache
```bash
npm run select-search
```
- Shows all search cache entries

#### Custom Query
```bash
wrangler d1 execute stockly --local \
  --command="SELECT * FROM alerts LIMIT 10;"
```

### Production

#### Apply Migrations
```bash
npm run db:migrate:production
```
- Applies migrations to remote D1
- **Always run after adding new migrations**

#### Query Stock Prices
```bash
npm run prod:select-prices
```

#### Query Search Cache
```bash
npm run prod:select-search
```

#### Query Alerts
```bash
wrangler d1 execute stockly --remote \
  --command="SELECT * FROM alerts ORDER BY created_at DESC;"
```

#### Check Database Size
```bash
wrangler d1 execute stockly --remote \
  --command="SELECT 
    (SELECT COUNT(*) FROM stock_prices) as stock_prices,
    (SELECT COUNT(*) FROM search_cache) as search_cache,
    (SELECT COUNT(*) FROM alerts) as alerts;"
```

---

## KV Operations

### Create Namespace
```bash
wrangler kv namespace create "alertsKv"
```
- Creates new KV namespace
- Returns ID to add to `wrangler.jsonc`

### List All Namespaces
```bash
wrangler kv namespace list
```

### Get Value
```bash
wrangler kv key get "alert:ALERT_ID:state" \
  --namespace-id=544d9ef44da84d1bb7292ff3f741cedd
```

### Put Value
```bash
wrangler kv key put "alert:ALERT_ID:state" \
  '{"lastConditionMet":true}' \
  --namespace-id=544d9ef44da84d1bb7292ff3f741cedd
```

### List Keys
```bash
wrangler kv key list \
  --namespace-id=544d9ef44da84d1bb7292ff3f741cedd
```

### Delete Key
```bash
wrangler kv key delete "alert:ALERT_ID:state" \
  --namespace-id=544d9ef44da84d1bb7292ff3f741cedd
```

---

## Deployment

### Deploy to Production
```bash
npm run deploy
```
- Builds and deploys worker
- Updates cron triggers
- Takes ~10-20 seconds
- Zero downtime

### Dry Run (Build Only)
```bash
npm run build
```
- Validates code
- Doesn't deploy

### View Deployments
```bash
wrangler deployments list
```
- Shows recent deployments
- Includes version IDs

### Rollback Deployment
```bash
wrangler rollback [version-id]
```
- Reverts to previous version
- Use version ID from `deployments list`

---

## Monitoring

### Tail Logs (Real-time)
```bash
wrangler tail
```
- Shows live request logs
- Shows cron executions
- Press Ctrl+C to exit

### Tail with Filtering
```bash
wrangler tail --format=pretty
```
- Pretty-printed output

### View Worker Info
```bash
wrangler whoami
```
- Shows logged-in account
- Verifies authentication

---

## Secrets Management

### Set Secret
```bash
wrangler secret put DOCS_USER
# Enter value when prompted
```

### Delete Secret
```bash
wrangler secret delete DOCS_USER
```

### List Secrets
```bash
wrangler secret list
```
- Shows secret names (not values)

---

## API Testing (cURL)

### Health Check
```bash
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/health
```

### Get Stock Quote
```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stock?symbol=AAPL"
```

### Search Stocks
```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/search-stock?query=apple"
```

### Get Multiple Stocks
```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stocks?symbols=AAPL,MSFT,GOOGL"
```

### List Alerts
```bash
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts
```

### Create Alert
```bash
curl -X POST https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "direction": "above",
    "threshold": 200,
    "channel": "email",
    "target": "user@example.com",
    "notes": "Test alert"
  }'
```

### Get Single Alert
```bash
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts/ALERT_ID
```

### Update Alert
```bash
curl -X PUT https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts/ALERT_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'
```

### Delete Alert
```bash
curl -X DELETE https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts/ALERT_ID
```

---

## Maintenance

### Clear Local Database
```bash
rm -rf .wrangler/state
npm run dev
```
- Deletes local D1 and KV
- Next `npm run dev` recreates

### Backup Alerts (Production)
```bash
wrangler d1 execute stockly --remote \
  --command="SELECT * FROM alerts;" \
  --json > alerts_backup.json
```

### Restore Alerts
```sql
-- Generate INSERT statements from backup
-- Then execute with wrangler d1 execute
```

### Check Worker Status
```bash
curl -I https://stockly-api.ahmednasser1993.workers.dev/v1/api/health
```
- Shows response headers
- Verifies worker is running

---

## Troubleshooting

### View Wrangler Logs
```bash
# Logs are automatically saved
cat ~/.config/.wrangler/logs/wrangler-*.log | tail -100
```

### Check Node/NPM Version
```bash
node --version  # Should be >= 18
npm --version
```

### Clear NPM Cache
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Check Cloudflare Status
```bash
curl https://www.cloudflarestatus.com/api/v2/status.json
```

### Verify Authentication
```bash
wrangler whoami
```
- If not logged in: `wrangler login`

---

## Git

### Typical Workflow
```bash
# Check status
git status

# Stage changes
git add .

# Commit
git commit -m "Add alerts feature"

# Push
git push origin main

# View changes
git diff
git log --oneline -10
```

### Useful Branches
```bash
# Create feature branch
git checkout -b feature/alerts

# Merge to main
git checkout main
git merge feature/alerts

# Delete branch
git branch -d feature/alerts
```

---

## Documentation

### Serve Docs Locally
```bash
npm run doc
```
- Starts local server on port 4173
- Login: `stockly` / `dashboard`
- Override: `DOCS_USER=user DOCS_PASS=pass npm run doc`

### View OpenAPI Docs
```bash
# Located in docs/endpoints.html
open docs/endpoints.html
```

---

## Package Management

### Install Dependencies
```bash
npm install
```

### Update Wrangler
```bash
npm update wrangler
```

### Check Outdated Packages
```bash
npm outdated
```

### Audit Security
```bash
npm audit
npm audit fix
```

---

## Performance

### Measure Bundle Size
```bash
npm run build
# Check output for "Total Upload" size
```

### Test Locally
```bash
# Terminal 1
npm run dev

# Terminal 2
ab -n 1000 -c 10 http://localhost:8787/v1/api/health
```
- Requires Apache Bench (ab)
- Tests 1000 requests, 10 concurrent

---

## CI/CD Setup

### GitHub Actions Example
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test
      - run: npm run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Set up API Token
1. Go to Cloudflare Dashboard
2. My Profile → API Tokens
3. Create Token → Edit Cloudflare Workers
4. Add to GitHub Secrets

---

## Quick Reference

| Task | Command |
|------|---------|
| Local dev | `npm run dev` |
| Run tests | `npm test` |
| Deploy | `npm run deploy` |
| View logs | `wrangler tail` |
| DB query | `wrangler d1 execute stockly --remote --command="..."` |
| Rollback | `wrangler rollback VERSION_ID` |
| Backup alerts | `wrangler d1 execute stockly --remote --command="SELECT * FROM alerts;" > backup.json` |

---

## Environment Variables

### Local Development
No `.env` file needed - API keys hardcoded in `src/util.ts`

### Production Secrets
```bash
wrangler secret put SECRET_NAME
```

Available in worker:
```typescript
env.SECRET_NAME
```

---

## Aliases (Optional)

Add to `~/.zshrc` or `~/.bashrc`:

```bash
alias wt='wrangler tail'
alias wd='wrangler deploy'
alias wdb='wrangler d1 execute stockly --remote'
alias stockly-dev='cd ~/workspace/stockly/api && npm run dev'
alias stockly-test='cd ~/workspace/stockly/api && npm test'
```

Then:
```bash
source ~/.zshrc
stockly-dev  # Quick start
```

---

## Emergency

### Service Down
```bash
# Check status
curl -I https://stockly-api.ahmednasser1993.workers.dev/v1/api/health

# View logs
wrangler tail

# Rollback if needed
wrangler deployments list
wrangler rollback VERSION_ID
```

### Database Issues
```bash
# Check if tables exist
wrangler d1 execute stockly --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table';"

# Reapply migrations if missing
npm run db:migrate:production
```

### KV Issues
```bash
# Verify KV namespace exists
wrangler kv namespace list

# Recreate if missing
wrangler kv namespace create "alertsKv"
# Update wrangler.jsonc with new ID
npm run deploy
```

---

For more details, see:
- `README.md` - Project overview
- `DEPLOYMENT.md` - Deployment guide
- `docs/API_REFERENCE.md` - API documentation
- `docs/ARCHITECTURE.md` - System design


