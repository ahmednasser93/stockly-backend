# Configuration Variables Reference

This document lists all configuration variables used in the Stockly API, their endpoints, default values, storage locations, and how they are used.

---

## Table of Contents

1. [Admin Configuration](#admin-configuration) - System-wide settings
2. [User Settings](#user-settings) - Per-user application settings
3. [User Preferences](#user-preferences) - Per-user notification preferences
4. [Internal Cache/Performance Config](#internal-cache-performance-config) - Non-configurable internal settings

---

## Admin Configuration

**Storage:** KV Namespace (`alertsKv`) - Key: `admin:config`  
**Cache:** In-memory for 1 minute (then reads from KV)  
**Scope:** System-wide (affects all users)

### Endpoints

- **Get Config:** `GET /config/get`
- **Update Config:** `POST /config/update`

### Configuration Variables

#### 1. `pollingIntervalSec`
- **Type:** `number`
- **Default:** `30` (seconds)
- **Range:** Any positive integer
- **Usage:** Controls how often stock data is refreshed from Financial Modeling Prep API
- **Where it's used:**
  - `get-stock.ts`: Determines if cached stock data is still fresh
  - `get-stocks.ts`: Determines if cached stock data is still fresh
  - `cache.ts`: Used to validate cache entry age
  
**Example Update:**
```bash
curl -X POST https://stockly-api.ahmednasser1993.workers.dev/config/update \
  -H "Content-Type: application/json" \
  -d '{
    "pollingIntervalSec": 60
  }'
```

**How it works:**
- When a stock request comes in, the API checks if cached data is older than `pollingIntervalSec`
- If cache is fresh (< `pollingIntervalSec` old), returns cached data
- If cache is expired (>= `pollingIntervalSec` old), fetches fresh data from FMP API

---

#### 2. `primaryProvider`
- **Type:** `string`
- **Default:** `"alpha-feed"`
- **Usage:** Name of the primary data provider (currently not actively used in routing logic)
- **Purpose:** Reserved for future multi-provider support

---

#### 3. `backupProvider`
- **Type:** `string`
- **Default:** `"beta-feed"`
- **Usage:** Name of the backup data provider (currently not actively used in routing logic)
- **Purpose:** Reserved for future multi-provider support

---

#### 4. `alertThrottle`
- **Type:** `object`
- **Default:** `{ maxAlerts: 100, windowSeconds: 60 }`
- **Fields:**
  - `maxAlerts` (number): Maximum number of alerts that can be triggered in the window
  - `windowSeconds` (number): Time window in seconds for throttling

**Example Update:**
```bash
curl -X POST https://stockly-api.ahmednasser1993.workers.dev/config/update \
  -H "Content-Type: application/json" \
  -d '{
    "alertThrottle": {
      "maxAlerts": 200,
      "windowSeconds": 120
    }
  }'
```

**Note:** Currently reserved for future use in alert throttling logic.

---

#### 5. `featureFlags`
- **Type:** `object`
- **Default:** 
  ```json
  {
    "alerting": true,
    "sandboxMode": false,
    "simulateProviderFailure": false
  }
  ```
- **Fields:**
  - `alerting` (boolean): Enable/disable the alerting system
  - `sandboxMode` (boolean): Enable sandbox mode (reserved for future use)
  - `simulateProviderFailure` (boolean): When enabled, API returns stale cached data instead of calling external providers

**Example Update:**
```bash
curl -X POST https://stockly-api.ahmednasser1993.workers.dev/config/update \
  -H "Content-Type: application/json" \
  -d '{
    "featureFlags": {
      "simulateProviderFailure": true
    }
  }'
```

**Usage:**
- `simulateProviderFailure`: Used in `get-stock.ts` to test fallback behavior. When `true`, returns stale data from D1 database instead of calling FMP API.

**Convenience Endpoints:**
- **Enable Simulation:** `POST /v1/api/simulate-provider-failure`
- **Disable Simulation:** `POST /v1/api/disable-provider-failure`

---

### Complete Admin Config Example

```bash
# Get current config
curl https://stockly-api.ahmednasser1993.workers.dev/config/get

# Update multiple fields
curl -X POST https://stockly-api.ahmednasser1993.workers.dev/config/update \
  -H "Content-Type: application/json" \
  -d '{
    "pollingIntervalSec": 45,
    "featureFlags": {
      "alerting": true,
      "sandboxMode": false,
      "simulateProviderFailure": false
    },
    "alertThrottle": {
      "maxAlerts": 150,
      "windowSeconds": 90
    }
  }'
```

**Response:**
```json
{
  "pollingIntervalSec": 45,
  "primaryProvider": "alpha-feed",
  "backupProvider": "beta-feed",
  "alertThrottle": {
    "maxAlerts": 150,
    "windowSeconds": 90
  },
  "featureFlags": {
    "alerting": true,
    "sandboxMode": false,
    "simulateProviderFailure": false
  }
}
```

---

## User Settings

**Storage:** D1 Database (`user_settings` table)  
**Scope:** Per-user (each user has their own settings)

### Endpoints

- **Get Settings:** `GET /v1/api/settings/:userId`
- **Update Settings:** `PUT /v1/api/settings`

### Configuration Variables

#### 1. `refreshIntervalMinutes`
- **Type:** `number`
- **Default:** `5` (minutes)
- **Range:** `1` to `720` (1 minute to 12 hours)
- **Usage:** Client-side preference for how often the app should refresh stock data
- **Important:** This is a **client-side preference** only. The API stores it but does NOT use it server-side. Clients should read this value and implement their own polling logic.

**Example Update:**
```bash
curl -X PUT https://stockly-api.ahmednasser1993.workers.dev/v1/api/settings \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "refreshIntervalMinutes": 10
  }'
```

**Example Get:**
```bash
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/settings/user123
```

**Response:**
```json
{
  "userId": "user123",
  "refreshIntervalMinutes": 10,
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

**Note:** The API uses `pollingIntervalSec` (admin config) for server-side cache refresh. This `refreshIntervalMinutes` setting is intended for client applications to control their own refresh intervals.

---

## User Preferences

**Storage:** D1 Database (`user_notification_preferences` table)  
**Scope:** Per-user (each user has their own preferences)

### Endpoints

- **Get Preferences:** `GET /v1/api/preferences/:userId`
- **Update Preferences:** `PUT /v1/api/preferences`

### Configuration Variables

#### 1. `enabled`
- **Type:** `boolean`
- **Default:** `true`
- **Usage:** Enable/disable notifications for the user

#### 2. `quietStart`
- **Type:** `string | null`
- **Default:** `null`
- **Format:** `"HH:MM"` (24-hour format, e.g., `"22:00"`)
- **Usage:** Start time of quiet hours (do not send notifications during this period)

#### 3. `quietEnd`
- **Type:** `string | null`
- **Default:** `null`
- **Format:** `"HH:MM"` (24-hour format, e.g., `"08:00"`)
- **Usage:** End time of quiet hours (do not send notifications during this period)

#### 4. `allowedSymbols`
- **Type:** `string[] | null`
- **Default:** `null`
- **Usage:** List of stock symbols for which notifications are allowed. If `null`, all symbols are allowed.

#### 5. `maxDaily`
- **Type:** `number | null`
- **Default:** `null`
- **Range:** Non-negative integer
- **Usage:** Maximum number of notifications per day. If `null`, no limit.

**Example Update:**
```bash
curl -X PUT https://stockly-api.ahmednasser1993.workers.dev/v1/api/preferences \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "enabled": true,
    "quietStart": "22:00",
    "quietEnd": "08:00",
    "allowedSymbols": ["AAPL", "MSFT", "GOOGL"],
    "maxDaily": 10
  }'
```

**Example Get:**
```bash
curl https://stockly-api.ahmednasser1993.workers.dev/v1/api/preferences/user123
```

**Response:**
```json
{
  "userId": "user123",
  "enabled": true,
  "quietStart": "22:00",
  "quietEnd": "08:00",
  "allowedSymbols": ["AAPL", "MSFT", "GOOGL"],
  "maxDaily": 10,
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

**Note:** Currently, these preferences are stored but not actively enforced in the alert cron job. They are reserved for future notification filtering logic.

---

## Internal Cache/Performance Config

These are **internal, non-configurable** settings that control caching and performance optimizations. They cannot be changed via API endpoints but are documented here for reference.

### 1. Admin Config Cache TTL
- **Variable:** `CONFIG_CACHE_TTL_MS`
- **Value:** `60 * 1000` (1 minute)
- **Location:** `src/api/config.ts`
- **Usage:** Admin config is cached in memory for 1 minute to reduce KV reads (since it's read on every stock request)

---

### 2. Search Cache TTL
- **Variable:** `DB_CACHE_TTL_SECONDS`
- **Value:** `20 * 60` (20 minutes)
- **Location:** `src/api/search-stock.ts`
- **Usage:** Search results are cached in both memory and D1 for 20 minutes

---

### 3. Provider Failure Notification Throttle
- **Variable:** `THROTTLE_WINDOW_SECONDS`
- **Value:** `300` (5 minutes)
- **Location:** `src/api/throttle-cache.ts`
- **Usage:** Provider failure notifications are throttled to once per 5 minutes per symbol (in-memory cache)

---

### 4. Alert States KV Load TTL
- **Variable:** `CACHE_TTL_MS`
- **Value:** `60 * 60 * 1000` (1 hour)
- **Location:** `src/alerts/state-cache.ts`
- **Usage:** Alert states are loaded from KV into memory cache once per hour

---

### 5. Alert States KV Write Interval
- **Variable:** `KV_WRITE_INTERVAL_MS`
- **Value:** `60 * 60 * 1000` (1 hour)
- **Location:** `src/alerts/state-cache.ts`
- **Usage:** Pending alert state updates are batched and written to KV once per hour (instead of every cron run)

**How it works:**
1. Alert cron runs every 5 minutes (`*/5 * * * *` in `wrangler.jsonc`)
2. Alert states are updated in **memory cache** (not KV)
3. Every hour, all pending updates are **batched** and written to KV in a single batch
4. This reduces KV writes by ~92% (from every 5 minutes to once per hour)

---

## Summary Table

| Configuration | Storage | Endpoint | Default | Purpose |
|--------------|---------|----------|---------|---------|
| `pollingIntervalSec` | KV (`admin:config`) | `POST /config/update` | 30 seconds | Server-side stock data refresh interval |
| `refreshIntervalMinutes` | D1 (`user_settings`) | `PUT /v1/api/settings` | 5 minutes | Client-side refresh preference |
| `featureFlags` | KV (`admin:config`) | `POST /config/update` | See above | Feature toggles |
| `alertThrottle` | KV (`admin:config`) | `POST /config/update` | See above | Alert throttling settings |
| `enabled` | D1 (`user_notification_preferences`) | `PUT /v1/api/preferences` | `true` | User notification toggle |
| `quietStart` / `quietEnd` | D1 (`user_notification_preferences`) | `PUT /v1/api/preferences` | `null` | Quiet hours |
| `allowedSymbols` | D1 (`user_notification_preferences`) | `PUT /v1/api/preferences` | `null` | Allowed symbols filter |
| `maxDaily` | D1 (`user_notification_preferences`) | `PUT /v1/api/preferences` | `null` | Daily notification limit |

---

## Important Notes

1. **Admin Config vs User Settings:**
   - `pollingIntervalSec` (admin) controls **server-side** cache refresh from FMP API
   - `refreshIntervalMinutes` (user) is a **client-side preference** only (API stores it but doesn't use it)

2. **KV Update Frequency:**
   - Admin config (`pollingIntervalSec`, `featureFlags`, etc.): Updated **immediately** when `/config/update` is called
   - Alert states: Updated **once per hour** (batched writes for performance)

3. **Caching Strategy:**
   - Admin config: Cached in memory for 1 minute to reduce KV reads
   - Alert states: Cached in memory for 1 hour, flushed to KV once per hour
   - Search results: Cached in memory + D1 for 20 minutes
   - Stock quotes: Cached in memory based on `pollingIntervalSec`

4. **Feature Flags:**
   - `simulateProviderFailure`: When enabled, all stock endpoints return stale data from D1 instead of calling FMP API (useful for testing fallback behavior)

