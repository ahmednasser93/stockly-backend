```markdown
# Stockly API Worker

Cloudflare Workers backend for Stockly. Provides cached quotes, multi-symbol batching, search with persistent caching, price alerts with cron evaluation, and comprehensive API documentation.

**Production URL:** https://stockly-api.ahmednasser1993.workers.dev

---

## 📚 Documentation

- **[docs/INDEX.md](docs/INDEX.md)** - Complete documentation index
- **[docs/API_REFERENCE.md](docs/API_REFERENCE.md)** - Full API documentation
- **[docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)** - Database tables and queries
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System design and patterns
- **[docs/COMMANDS.md](docs/COMMANDS.md)** - CLI commands reference
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment guide
- **[WEBAPP_INTEGRATION_PROMPT.md](WEBAPP_INTEGRATION_PROMPT.md)** - For frontend team
- **[MOBILE_APP_INTEGRATION_PROMPT.md](MOBILE_APP_INTEGRATION_PROMPT.md)** - For mobile team

---

## Project Map

```
src/
  alerts/
    evaluate-alerts.ts // pure alert evaluation logic with state deduplication
    state.ts           // KV-backed alert state management
    storage.ts         // D1 CRUD operations for alerts
    types.ts           // TypeScript types for alerts
    validation.ts      // request payload validation
  api/
    alerts.ts          // alerts CRUD endpoint handler
    cache.ts           // TTL Map helpers (shared in-memory cache)
    get-stock.ts       // single symbol quote handler + D1 inserts
    get-stocks.ts      // multi-symbol batching w/ cache + DB fallbacks
    search-stock.ts    // symbol search w/ memory + D1 cache (20m)
    health.ts          // /v1/api/health
  cron/
    alerts-cron.ts     // scheduled price alert evaluation
  index.ts             // router + CORS + cron handler
  util.ts              // API keys + json() helper
docs/
  endpoints.html       // interactive explorer (Basic Auth + overlay)
migrations/
  001_init.sql         // stock_prices table
  002_add_search_cache.sql
  003_create_alerts.sql // alerts table with indexes
scripts/
  doc-server.mjs       // optional local static server
test/                  // Vitest suites (Workers runtime)
wrangler.jsonc         // Worker config + D1 + KV + cron
```

---

## Running Locally

```bash
npm install
npm run dev            # applies local D1 migrations + wrangler dev --local
# Worker: http://127.0.0.1:8787
# Docs:   npm run doc  → http://localhost:4173 (Basic Auth: stockly/dashboard unless overridden)
```

Preview docs (local-only):

```bash
DOCS_USER=myuser DOCS_PASS=mypass npm run doc
# http://localhost:4173
```

---

## Secrets / Env Vars

All secrets live in Wrangler:

```bash
wrangler secret put DOCS_USER   # default "stockly"
wrangler secret put DOCS_PASS   # default "dashboard"
```

The Worker reads them from `env.DOCS_USER` / `env.DOCS_PASS`. No `.env` file is needed; the FMP API key is hardcoded in `src/util.ts`.

---

## Deployment (Workers + Assets)

```bash
npm run deploy
wrangler d1 migrations apply stockly --remote   # run on first deploy or schema changes
```

Docs are not published with the Worker; run `npm run doc` locally when needed.

---

## Migrations

```bash
# Local persisted DB (used by npm run dev)
npm run db:migrate:local

# Production
wrangler d1 migrations apply stockly --remote
```

---

## Alerts Feature

The alerts system monitors stock prices and triggers notifications when configured thresholds are met.

### Architecture

- **D1 Storage**: Alert configurations stored in `alerts` table (migration 003)
- **KV State**: Alert state snapshots stored in `alertsKv` namespace to prevent duplicate notifications
- **Cron Job**: Scheduled evaluation runs periodically to check active alerts
- **Pure Logic**: `evaluateAlerts()` function handles condition checking with state deduplication

### Alert Types

- **Direction**: `above` or `below` (trigger when price crosses threshold)
- **Status**: `active` or `paused`
- **Channel**: `notification` (Expo Push Notifications to mobile devices)

### Endpoints

- `GET /v1/api/alerts` - List all alerts
- `POST /v1/api/alerts` - Create new alert
- `GET /v1/api/alerts/:id` - Get single alert
- `PUT /v1/api/alerts/:id` - Update alert
- `DELETE /v1/api/alerts/:id` - Delete alert

### Setup Requirements

1. Create KV namespace:
```bash
wrangler kv namespace create "alertsKv"
```

2. Add to `wrangler.jsonc`:
```json
"kv_namespaces": [
  {
    "binding": "alertsKv",
    "id": "your-kv-namespace-id"
  }
],
"triggers": {
  "crons": ["*/5 * * * *"]
}
```

3. Run migration:
```bash
wrangler d1 migrations apply stockly --remote
```

### Push Notification Integration

The alerts system sends push notifications to mobile devices via Expo Push Notification Service.

**How it works:**
1. Mobile app registers its Expo Push Token with the backend on startup
2. Users create alerts with `channel: "notification"`
3. Cron worker evaluates alerts every 5 minutes
4. When an alert triggers, the backend sends a push notification to the user's device via Expo API

**Push Token Management:**
- `POST /v1/api/push-token` - Register/update device push token
- `GET /v1/api/push-token/:userId` - Retrieve user's push token
- Tokens are stored in the `user_push_tokens` table

---

## Inspecting the Database

Scripts:

```bash
npm run select-prices        # local stock_prices
npm run select-search        # local search_cache
npm run prod:select-prices   # remote stock_prices
npm run prod:select-search   # remote search_cache
```

Custom query:

```bash
wrangler d1 execute stockly --local \
  --command="SELECT symbol, price, timestamp FROM stock_prices WHERE symbol='AAPL' ORDER BY id DESC LIMIT 5;"
```

---

## Troubleshooting

- **Docs prompt loops** → Credentials must match `DOCS_USER` / `DOCS_PASS`. Update secrets + redeploy.
- **Local DB empty** → Use `npm run dev` so wrangler persists to `.wrangler/state`.
- **Migrations missing remotely** → Run `wrangler d1 migrations apply stockly --remote`.

---

## Examples

### API request

```bash
curl "https://stockly-api.ahmednasser1993.workers.dev/v1/api/get-stocks?symbols=AMZN,AAPL,TSLA"
```

### Database query

```bash
wrangler d1 execute stockly --remote \
  --command="SELECT id, symbol, price, timestamp FROM stock_prices ORDER BY id DESC LIMIT 10;"
```

### Helper usage

```ts
// src/util.ts
import { json } from "./util";

export function healthCheck() {
  return json({ status: "ok" });
}
```

---

Happy shipping 🚀
```
