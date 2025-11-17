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
    config.ts          // admin config system with KV storage + simulation mode
    get-stock.ts       // single symbol quote handler + D1 inserts + simulation fallback
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

## Provider Failure Handling & Simulation

### Automatic Fallback (Production)

The API automatically handles provider failures by falling back to cached database data and notifying users:

1. **Automatic Detection**: When the external provider (FMP API) fails or returns errors:
   - HTTP errors (500, 503, etc.)
   - Invalid data responses
   - Network errors or timeouts
   
2. **Fallback Behavior**: The `get-stock` endpoint automatically:
   - Retrieves the most recent cached price from D1 database
   - Returns stale data with `stale: true` and `stale_reason: "provider_api_error"`, `"provider_invalid_data"`, `"provider_network_error"`, etc.
   - Sends push notifications to all registered users (throttled to once per 5 minutes per symbol)
   - Uses `ctx.waitUntil` for non-blocking notification delivery

3. **User Notifications**: When a provider failure occurs:
   - All registered users receive a push notification: "⚠️ Service Alert: Using Cached Data"
   - Message: "We're experiencing issues with our data provider. Showing last saved price for {symbol}. We're working on restoring full service."
   - Notifications are throttled to prevent spam (max once per 5 minutes per symbol)

4. **Response Format**: When fallback occurs:
   ```json
   {
     "stale": true,
     "stale_reason": "provider_api_error",
     "symbol": "AAPL",
     "price": 150.5,
     "dayLow": 149.0,
     "dayHigh": 151.0,
     "volume": 1000000,
     "lastUpdatedAt": "2025-01-15T10:30:00.000Z",
     "timestamp": 1736949000
   }
   ```

### Provider Failure Simulation (Testing)

The provider failure simulation feature allows testing fallback behavior without actual provider failures. When enabled, the API returns stale cached data from the database instead of calling external providers.

### How Simulation Mode Works

1. **Enable Simulation**: Use `POST /v1/api/simulate-provider-failure` to enable simulation mode
2. **Simulation Behavior**: When simulation is active, the `get-stock` endpoint:
   - Skips calling external providers
   - Retrieves the most recent cached price from D1 database
   - Returns stale data with simulation flags: `simulationActive: true`, `stale: true`, `stale_reason: "simulation_mode"`
   - Does NOT send user notifications (simulation only)
3. **Disable Simulation**: Use `POST /v1/api/disable-provider-failure` to restore normal provider calls

**Note**: Simulation mode is separate from automatic fallback. In production, when providers actually fail, the system automatically falls back to DB and notifies users, regardless of the simulation flag.

---

## Widget Data Support

The API supports home screen widgets by providing stock data that can be cached locally on mobile devices. Widgets consume the same `get-stock` and `get-stocks` endpoints as the main app.

### Widget Data Format

Widgets expect stock data in the following format (derived from `get-stock` responses):

```json
{
  "stocks": {
    "AAPL": {
      "symbol": "AAPL",
      "price": 191.50,
      "updatedAt": "2025-01-15T10:54:00Z",
      "change": 2.50,
      "changePercent": 1.32,
      "previousClose": 189.00,
      "stale": false,
      "stale_reason": null
    }
  },
  "lastSyncedAt": "2025-01-15T10:54:00Z"
}
```

### Widget Caching Behavior

- **Mobile apps** cache widget data locally (AsyncStorage on Android, App Group UserDefaults on iOS)
- **Widgets** read from local cache only (not directly from backend)
- **Cache sync** happens when the main app fetches fresh data
- **Stale data** is handled gracefully - widgets show cached prices when provider fails

### Widget Polling Expectations

- Widgets refresh every 15 minutes (minimum allowed by iOS/Android)
- Main app should sync widget data whenever:
  - Stock data is fetched via `get-stock` or `get-stocks`
  - Stocks are added/removed from watchlist
  - User manually refreshes in the app

### Stale Data in Widgets

- When provider fails, widgets show cached prices from database fallback
- `stale: true` and `stale_reason` fields indicate data staleness
- Widgets display timestamps so users know when data was last updated

### Widget Cache File Structure

The mobile app stores widget data in JSON format:

```json
{
  "stocks": {
    "<SYMBOL>": {
      "symbol": "<SYMBOL>",
      "price": <NUMBER>,
      "updatedAt": "<ISO8601_TIMESTAMP>",
      "change": <NUMBER | null>,
      "changePercent": <NUMBER | null>,
      "previousClose": <NUMBER | null>,
      "stale": <BOOLEAN>,
      "stale_reason": "<STRING | null>"
    }
  },
  "lastSyncedAt": "<ISO8601_TIMESTAMP>"
}
```

**Storage Keys:**
- Android: `@stockly:widget-data` in AsyncStorage
- iOS: `@stockly:widget-data` in App Group UserDefaults

### Endpoints

- `POST /v1/api/simulate-provider-failure` - Enable simulation mode
- `POST /v1/api/disable-provider-failure` - Disable simulation mode
- `GET /config/get` - Get current admin configuration
- `POST /config/update` - Update admin configuration

### Configuration

The simulation flag is stored in the admin config under `featureFlags.simulateProviderFailure`. The config is persisted in KV storage (`alertsKv` namespace) under the key `admin:config`.

### Response Format

When simulation is active and data is available in the database:

```json
{
  "simulationActive": true,
  "stale": true,
  "stale_reason": "simulation_mode",
  "symbol": "AAPL",
  "price": 150.5,
  "dayLow": 149.0,
  "dayHigh": 151.0,
  "volume": 1000000,
  "lastUpdatedAt": "2025-01-15T10:30:00.000Z",
  "timestamp": 1736949000
}
```

When simulation is active but no data exists in the database:

```json
{
  "error": "no_price_available"
}
```

### Use Cases

- **Testing Fallback Logic**: Verify that mobile/web apps handle stale data correctly
- **QA Testing**: Test UI components that display warning banners for stale data
- **Resilience Testing**: Validate that the system gracefully handles provider failures

### Mobile App Integration

When the mobile app receives a response with `stale === true` and `simulationActive === true`, it displays a non-blocking inline warning banner: "Simulated fallback: showing last saved price."

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
