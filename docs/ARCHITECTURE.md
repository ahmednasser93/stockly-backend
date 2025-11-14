# Stockly API Architecture

**Platform:** Cloudflare Workers  
**Runtime:** V8 Isolates  
**Language:** TypeScript  
**Framework:** Minimal (vanilla fetch API)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Apps                              │
│              (Webapp, Mobile, Third-party)                       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ HTTPS
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                            │
│                      (stockly-api)                               │
│                                                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │   Router   │  │   CORS     │  │  Handlers  │                │
│  │ index.ts   │  │ Middleware │  │  (api/*)   │                │
│  └────────────┘  └────────────┘  └────────────┘                │
└───────┬─────────────────────┬───────────────────┬───────────────┘
        │                     │                   │
        │                     │                   │
        ▼                     ▼                   ▼
┌──────────────┐      ┌──────────────┐   ┌──────────────┐
│ FMP API      │      │   D1 SQLite  │   │  KV Storage  │
│ (External)   │      │  (3 tables)  │   │ (alertsKv)   │
└──────────────┘      └──────────────┘   └──────────────┘
        │
        │ Cron: */5 * * * *
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Scheduled Cron Worker                         │
│                    (alerts-cron.ts)                              │
│                                                                   │
│  1. Fetch active alerts from D1                                  │
│  2. Fetch current prices from FMP API                            │
│  3. Evaluate conditions with state deduplication                 │
│  4. Update KV state                                              │
│  5. Log/Send notifications                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Router (`src/index.ts`)

**Responsibility:** Request routing and CORS handling

**Flow:**
```typescript
Request → CORS Options → Route Matching → Handler → Response
```

**Routes:**
- `/v1/api/health` → `healthCheck()`
- `/v1/api/get-stock` → `getStock()`
- `/v1/api/get-stocks` → `getStocks()`
- `/v1/api/search-stock` → `searchStock()`
- `/v1/api/alerts/*` → `handleAlertsRequest()`

**Entry Points:**
- `fetch()` - HTTP requests
- `scheduled()` - Cron triggers

---

### 2. API Handlers (`src/api/`)

#### get-stock.ts
- Fetches single stock quote from FMP API
- Caches in D1 (30s TTL)
- Returns enriched quote data

#### get-stocks.ts
- Batch fetches multiple symbols
- Per-symbol in-memory cache (30s)
- Falls back to D1 on API failure
- Concurrent requests for performance

#### search-stock.ts
- Searches FMP API for symbols
- Two-tier caching: memory + D1 (20min)
- Returns matching symbols with metadata

#### health.ts
- Simple health check endpoint
- Returns `{"status": "ok"}`

#### alerts.ts
- CRUD operations for alerts
- Delegates to storage layer
- Handles request validation
- Returns appropriate HTTP codes

---

### 3. Alerts System (`src/alerts/`)

#### types.ts
- TypeScript interfaces
- Type safety across modules
- Enums for direction, status, channel

#### validation.ts
- Pure validation functions
- No external dependencies
- Returns structured errors
- Normalizes input (uppercase symbols)

#### storage.ts
- D1 database operations
- Type-safe SQL queries
- Row mapping to domain objects
- CRUD abstractions

#### state.ts
- KV namespace operations
- Alert state persistence
- JSON serialization
- Key generation utilities

#### evaluate-alerts.ts
- **Pure function** - no I/O
- Condition evaluation logic
- State-based deduplication
- Returns notifications + state updates

---

### 4. Cron Worker (`src/cron/alerts-cron.ts`)

**Schedule:** Every 5 minutes

**Process:**
```
1. Load active alerts from D1
2. Extract unique symbols
3. Fetch current prices from FMP API
4. Load previous state from KV
5. Call evaluateAlerts() with all data
6. Write updated state to KV
7. Log triggered alerts
```

**Error Handling:**
- Continues on individual quote failures
- Logs errors for monitoring
- Doesn't fail entire run

**Future Enhancement:**
- Replace console.log with email/webhook delivery

---

## Data Flow

### Stock Quote Request

```
Client Request
    ↓
Router (CORS + routing)
    ↓
getStock handler
    ↓
Check D1 cache (< 30s?)
    ↓
├─ Cache Hit → Return cached data
│
└─ Cache Miss
       ↓
   Fetch from FMP API
       ↓
   Store in D1
       ↓
   Return fresh data
```

### Alert Creation

```
Client POST /v1/api/alerts
    ↓
handleAlertsRequest
    ↓
validateNewAlert (validation.ts)
    ↓
├─ Invalid → Return 400 with errors
│
└─ Valid
       ↓
   createAlert (storage.ts)
       ↓
   Generate UUID
       ↓
   Insert to D1
       ↓
   Return created alert (201)
```

### Alert Evaluation (Cron)

```
Cron Trigger (every 5 min)
    ↓
runAlertCron
    ↓
Fetch active alerts (D1)
    ↓
Fetch current prices (FMP API)
    ↓
Load previous state (KV)
    ↓
evaluateAlerts (pure function)
    ↓
├─ No triggers → Update state, done
│
└─ Has triggers
       ↓
   Update state (KV)
       ↓
   Log notifications
       ↓
   (Future: Send emails/webhooks)
```

---

## Design Patterns

### 1. Pure Functions

**Example:** `evaluateAlerts()`

**Benefits:**
- Easy to test (no mocks needed)
- Predictable behavior
- Composable logic

**Pattern:**
```typescript
function evaluateAlerts(input: Input): Output {
  // No I/O, no side effects
  // Pure transformation
  return output;
}
```

### 2. Separation of Concerns

**Layers:**
- **Handlers** - HTTP concerns (req/res)
- **Validation** - Business rules
- **Storage** - Database operations
- **Logic** - Pure domain logic

**No layer depends on outer layers**

### 3. Dependency Injection

**Example:**
```typescript
export async function createAlert(env: Env, draft: AlertDraft) {
  // env is injected, not imported
}
```

**Benefits:**
- Easy testing (mock env)
- No global state
- Clear dependencies

### 4. Type Safety

**All boundaries typed:**
- API requests → validation
- DB rows → domain objects
- Function inputs/outputs

**Zero `any` types**

---

## Performance Optimizations

### 1. Multi-Layer Caching

```
Request → Memory Cache (30s)
             ↓ miss
          D1 Cache (30s-20min)
             ↓ miss
          FMP API (live)
```

### 2. Concurrent Requests

`get-stocks` fetches symbols in parallel:
```typescript
await Promise.all(symbols.map(fetchQuote));
```

### 3. Edge Computing

- Workers run at Cloudflare edge
- Low latency worldwide
- D1 read replicas in multiple regions

### 4. Efficient Storage

- Indexes on frequently queried columns
- TTL-based cleanup
- Minimal data stored

---

## Security Considerations

### Current State

✅ CORS enabled (required for web apps)  
✅ Input validation on all endpoints  
✅ SQL injection prevention (parameterized queries)  
✅ Type safety (TypeScript)  
⚠️ No authentication (planned)  
⚠️ No rate limiting (planned)

### Recommended Additions

1. **Authentication:**
   - API keys or JWT tokens
   - Per-user alert limits
   - OAuth for third-party apps

2. **Rate Limiting:**
   - Use Cloudflare rate limiting
   - Per-IP or per-API-key limits
   - Separate limits for read/write

3. **Input Sanitization:**
   - Already validates direction/status enums
   - Consider max alert count per user
   - Webhook URL validation

---

## Scalability

### Current Limits

- **Workers:** 100,000 requests/day (free plan)
- **D1:** 5GB storage, 5M reads/day (free plan)
- **KV:** 100,000 reads/day (free plan)
- **Cron:** Runs every 5 minutes

### Scaling Strategies

1. **More Frequent Cron:**
   - Change to `*/1 * * * *` for 1-minute checks
   - Requires paid plan

2. **Alert Batching:**
   - Group alerts by symbol
   - Single API call per unique symbol

3. **Read Replicas:**
   - D1 automatically replicates
   - Writes go to primary
   - Reads use nearest replica

4. **Horizontal Scaling:**
   - Workers auto-scale
   - No manual configuration
   - Handles traffic spikes

---

## Testing Strategy

### Unit Tests (`test/`)

- **Alerts Logic:** `alerts-evaluate.spec.ts`
- **Validation:** `alerts-validation.spec.ts`
- **Storage:** `alerts-storage.spec.ts` (mocked DB)
- **Handlers:** `alerts-handler.spec.ts` (mocked deps)
- **Existing:** `get-stock`, `get-stocks`, `search-stock`, etc.

**Test Framework:** Vitest with Cloudflare Workers pool

**Coverage:**
- 44 tests across 10 files
- All critical paths covered
- Edge cases tested

### Integration Testing

**Manual Testing:**
```bash
# Local
npm run dev
curl http://localhost:8787/v1/api/health

# Production
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts
```

---

## Monitoring & Observability

### Logs

```bash
# Real-time tail
wrangler tail

# View in dashboard
Cloudflare Dashboard → Workers → stockly-api → Logs
```

### Metrics

**Available in Dashboard:**
- Request count
- Error rate
- Response time (P50, P95, P99)
- Cron execution success/failure

### Alerting

**Recommended:**
- Alert on error rate > 1%
- Alert on cron job failures
- Alert on API rate limit approaching

---

## Deployment Pipeline

```
Code Changes
    ↓
Run Tests (npm test)
    ↓
Deploy (wrangler deploy)
    ↓
Cloudflare Network
    ↓
Instant Rollout (global)
    ↓
Monitor Logs
    ↓
Rollback if needed (wrangler rollback)
```

**Zero Downtime:** Workers deploy instantly without interruption

---

## Future Enhancements

### Short Term
1. Email/Webhook delivery for triggered alerts
2. User authentication system
3. Rate limiting per user
4. Alert history/audit log

### Medium Term
1. WebSocket support for real-time quotes
2. Technical indicators (RSI, MACD, etc.)
3. Portfolio tracking
4. Multi-user support with permissions

### Long Term
1. Machine learning price predictions
2. Social sentiment analysis
3. News integration
4. Advanced charting API

---

## Dependencies

### Production
**None** - Cloudflare Workers runtime only

### Development
- `wrangler` - CLI for Workers
- `vitest` - Testing framework
- `typescript` - Type checking
- `@cloudflare/vitest-pool-workers` - Test environment

**Minimal dependencies = faster deploys, fewer vulnerabilities**

---

## File Structure

```
src/
├── alerts/
│   ├── evaluate-alerts.ts    # Pure alert logic
│   ├── state.ts               # KV operations
│   ├── storage.ts             # D1 operations
│   ├── types.ts               # TypeScript types
│   └── validation.ts          # Input validation
├── api/
│   ├── alerts.ts              # Alerts CRUD handler
│   ├── cache.ts               # In-memory cache
│   ├── get-stock.ts           # Single quote
│   ├── get-stocks.ts          # Batch quotes
│   ├── health.ts              # Health check
│   └── search-stock.ts        # Symbol search
├── cron/
│   └── alerts-cron.ts         # Scheduled evaluation
├── index.ts                   # Router & entry point
└── util.ts                    # Shared utilities
```

---

## Best Practices Followed

✅ **Separation of Concerns** - Clear module boundaries  
✅ **Type Safety** - Full TypeScript coverage  
✅ **Pure Functions** - Testable logic  
✅ **Error Handling** - Try/catch everywhere  
✅ **Input Validation** - All user input validated  
✅ **Parameterized Queries** - No SQL injection  
✅ **Backward Compatibility** - New features don't break old  
✅ **Documentation** - Comprehensive docs  
✅ **Testing** - 44 tests, all passing  
✅ **Monitoring** - Logs and metrics available


