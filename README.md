```markdown
# Stockly API Worker

Cloudflare Workers backend for Stockly. Provides cached quotes, multi-symbol batching, search with persistent caching, and a password-protected API explorer served from the same worker.

---

## Project Map

```
src/
  api/
    cache.ts           // TTL Map helpers (shared in-memory cache)
    get-stock.ts       // single symbol quote handler + D1 inserts
    get-stocks.ts      // multi-symbol batching w/ cache + DB fallbacks
    search-stock.ts    // symbol search w/ memory + D1 cache (20m)
    docs.ts            // serves docs/ via Basic Auth
    health.ts          // /v1/api/health
  index.ts             // router + CORS + asset binding
  util.ts              // API keys + json() helper
docs/
  endpoints.html       // interactive explorer (Basic Auth + overlay)
migrations/
  001_init.sql         // stock_prices table
  002_add_search_cache.sql
scripts/
  doc-server.mjs       // optional local static server
test/                  // Vitest suites (Workers runtime)
wrangler.jsonc         // Worker config + D1 + assets binding
```

---

## Running Locally

```bash
npm install
npm run dev            # applies local D1 migrations + wrangler dev --local
# Worker: http://127.0.0.1:8787
# Docs:   http://127.0.0.1:8787/docs (Basic Auth: stockly/dashboard unless overridden)
```

Preview docs without Worker:

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

Docs live at `https://stockly-api.ahmednasser1993.workers.dev/docs/` behind HTTP Basic Auth.

---

## Updating Safely

1. `git pull && npm install`
2. Implement changes (src/docs/migrations/tests).
3. Run verification:
   ```bash
   npm test
   npm run db:migrate:local
   ```
4. Deploy: `npm run deploy`
5. Apply remote migrations if new: `wrangler d1 migrations apply stockly --remote`

---

## Migrations

```bash
# Local persisted DB (used by npm run dev)
npm run db:migrate:local

# Production
wrangler d1 migrations apply stockly --remote
```

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
