# Stockly Database Schema

**Database Type:** Cloudflare D1 (SQLite)  
**Database Name:** `stockly`  
**Database ID:** `d234268d-d8f1-49d2-9643-6a1d5bf0a589`

---

## Tables

### 1. stock_prices

**Purpose:** Caches stock price data to reduce API calls

**Schema:**
```sql
CREATE TABLE stock_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  name TEXT,
  price REAL,
  change_percentage REAL,
  volume INTEGER,
  market_cap INTEGER,
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_symbol ON stock_prices(symbol);
CREATE INDEX idx_timestamp ON stock_prices(timestamp);
```

**Columns:**
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | No | Auto-incrementing primary key |
| `symbol` | TEXT | No | Stock ticker symbol (e.g., "AAPL") |
| `name` | TEXT | Yes | Company name (e.g., "Apple Inc.") |
| `price` | REAL | Yes | Current stock price |
| `change_percentage` | REAL | Yes | Percentage change from previous close |
| `volume` | INTEGER | Yes | Trading volume |
| `market_cap` | INTEGER | Yes | Market capitalization |
| `timestamp` | INTEGER | No | Unix timestamp of when data was cached |

**Indexes:**
- `idx_symbol` - Fast lookup by ticker symbol
- `idx_timestamp` - Efficient time-based queries

**TTL:** Records older than 30 seconds are considered stale

**Created:** Migration `001_init.sql`

---

### 2. search_cache

**Purpose:** Caches stock search results to improve search performance

**Schema:**
```sql
CREATE TABLE search_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  results TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_search_query ON search_cache(query);
CREATE INDEX idx_search_timestamp ON search_cache(timestamp);
```

**Columns:**
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | No | Auto-incrementing primary key |
| `query` | TEXT | No | Search query string (lowercase) |
| `results` | TEXT | No | JSON stringified array of results |
| `timestamp` | INTEGER | No | Unix timestamp of when cached |

**Indexes:**
- `idx_search_query` - Fast lookup by search term
- `idx_search_timestamp` - Cleanup of old cache entries

**TTL:** Cache expires after 20 minutes (1,200,000 ms)

**Created:** Migration `002_add_search_cache.sql`

---

### 3. alerts

**Purpose:** Stores user-configured price alerts

**Schema:**
```sql
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above','below')),
  threshold REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_alerts_status ON alerts (status);
CREATE INDEX idx_alerts_symbol ON alerts (symbol);
```

**Columns:**
| Column | Type | Nullable | Constraints | Description |
|--------|------|----------|-------------|-------------|
| `id` | TEXT | No | PRIMARY KEY | UUID of the alert |
| `symbol` | TEXT | No | - | Stock ticker symbol |
| `direction` | TEXT | No | CHECK IN ('above','below') | Price direction trigger |
| `threshold` | REAL | No | - | Price threshold value |
| `status` | TEXT | No | CHECK IN ('active','paused') | Alert state |
| `channel` | TEXT | No | - | Notification channel (always "notification" for Expo Push) |
| `target` | TEXT | No | - | Email address or webhook URL |
| `notes` | TEXT | Yes | - | Optional user note |
| `created_at` | TEXT | No | DEFAULT now() | ISO 8601 creation timestamp |
| `updated_at` | TEXT | No | DEFAULT now() | ISO 8601 last update timestamp |

**Indexes:**
- `idx_alerts_status` - Fast filtering by active/paused status
- `idx_alerts_symbol` - Efficient lookups by stock symbol

**Constraints:**
- `direction` must be either 'above' or 'below'
- `status` must be either 'active' or 'paused'
- `threshold` must be a positive number (enforced at application level)

**Created:** Migration `003_create_alerts.sql`

---

## KV Namespace

### alertsKv

**Purpose:** Stores alert state to prevent duplicate notifications

**Binding:** `alertsKv`  
**Namespace ID:** `544d9ef44da84d1bb7292ff3f741cedd`

**Key Format:** `alert:{alertId}:state`

**Value Structure:**
```typescript
interface AlertStateSnapshot {
  lastConditionMet: boolean;      // Was condition met on last check
  lastPrice?: number;             // Last price when checked
  lastTriggeredAt?: number;       // Unix timestamp of last trigger
}
```

**Example:**
```json
{
  "lastConditionMet": true,
  "lastPrice": 205.50,
  "lastTriggeredAt": 1763147914000
}
```

**Usage:**
- Written by cron job after each evaluation
- Prevents duplicate notifications when price remains above/below threshold
- Allows re-triggering when price crosses back and forth

---

## Migrations

### 001_init.sql
- Creates `stock_prices` table
- Creates indexes on `symbol` and `timestamp`

### 002_add_search_cache.sql
- Creates `search_cache` table
- Creates indexes on `query` and `timestamp`

### 003_create_alerts.sql
- Creates `alerts` table with CHECK constraints
- Creates indexes on `status` and `symbol`

**Applying Migrations:**
```bash
# Local
npm run db:migrate:local

# Production
npm run db:migrate:production
```

---

## Query Examples

### Stock Prices

```sql
-- Get latest price for a symbol
SELECT * FROM stock_prices 
WHERE symbol = 'AAPL' 
ORDER BY timestamp DESC 
LIMIT 1;

-- Get all cached prices (last 24 hours)
SELECT * FROM stock_prices 
WHERE timestamp > (strftime('%s', 'now') - 86400) * 1000
ORDER BY timestamp DESC;

-- Clear old cache (older than 1 hour)
DELETE FROM stock_prices 
WHERE timestamp < (strftime('%s', 'now') - 3600) * 1000;
```

### Search Cache

```sql
-- Find cached search result
SELECT results FROM search_cache 
WHERE query = 'apple' 
AND timestamp > (strftime('%s', 'now') - 1200) * 1000
LIMIT 1;

-- Clear expired cache (older than 20 minutes)
DELETE FROM search_cache 
WHERE timestamp < (strftime('%s', 'now') - 1200) * 1000;
```

### Alerts

```sql
-- Get all active alerts
SELECT * FROM alerts 
WHERE status = 'active' 
ORDER BY created_at DESC;

-- Get alerts for specific symbol
SELECT * FROM alerts 
WHERE symbol = 'AAPL';

-- Count alerts by status
SELECT status, COUNT(*) as count 
FROM alerts 
GROUP BY status;

-- Get alerts about to trigger (within 5% of threshold)
SELECT a.*, p.price, 
       ABS(p.price - a.threshold) / a.threshold * 100 as distance_pct
FROM alerts a
JOIN stock_prices p ON a.symbol = p.symbol
WHERE a.status = 'active'
  AND ABS(p.price - a.threshold) / a.threshold < 0.05
ORDER BY distance_pct ASC;
```

---

## Maintenance

### Database Inspection

```bash
# List all tables
wrangler d1 execute stockly --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table';"

# Get table info
wrangler d1 execute stockly --remote \
  --command="PRAGMA table_info(alerts);"

# Check table sizes
wrangler d1 execute stockly --remote \
  --command="SELECT 
    (SELECT COUNT(*) FROM stock_prices) as stock_prices,
    (SELECT COUNT(*) FROM search_cache) as search_cache,
    (SELECT COUNT(*) FROM alerts) as alerts;"
```

### Cleanup Scripts

```sql
-- Clear all stock price cache
DELETE FROM stock_prices;

-- Clear all search cache
DELETE FROM search_cache;

-- Delete paused alerts older than 30 days
DELETE FROM alerts 
WHERE status = 'paused' 
AND created_at < datetime('now', '-30 days');
```

---

## Performance Notes

- D1 has read replication for fast reads
- Writes are eventually consistent
- Indexes significantly improve query performance
- Keep cache tables lean by regularly cleaning old data
- Consider adding composite indexes if query patterns change

---

## Backup & Recovery

**Automatic Backups:** Cloudflare handles D1 backups automatically

**Manual Export:**
```bash
# Export alerts table
wrangler d1 execute stockly --remote \
  --command="SELECT * FROM alerts;" \
  > alerts_backup.json
```

**Migration Rollback:**
Migrations cannot be automatically rolled back. To revert:
1. Deploy previous worker version
2. Manually fix database if schema changed
3. Consider keeping migration backups

