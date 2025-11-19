# KV Operations Optimization Analysis

## Current KV Usage Summary

### 1. Admin Config (`admin:config`)
**Location**: `api/src/api/config.ts`

**Operations**:
- **Read**: `getConfig()` - Called on EVERY `/get-stock` and `/get-stocks` request
- **Write**: `updateConfig()` - Only when admin updates settings (infrequent)

**Impact**: 🔴 **CRITICAL** - This is the biggest optimization opportunity
- Config is read on every stock API request
- If you have 1000 stock requests/day = 1000 KV reads just for config
- Config rarely changes (only when admin updates settings)

---

### 2. Alert State (`alert:{id}:state`)
**Location**: `api/src/alerts/state.ts`

**Operations**:
- **Read**: `loadState()` in cron job - One read per active alert (every 5 minutes)
- **Write**: `writeAlertState()` in cron job - One write per alert with state change
- **Delete**: When alert is deleted (infrequent)

**Impact**: 🟡 **MODERATE**
- Happens only in cron job (every 5 minutes)
- Reads all alert states, writes only changed ones
- Could batch reads with `kv.list()` if supported

---

### 3. Provider Failure Throttling (`provider_failure:{symbol}:notification_sent`)
**Location**: `api/src/api/get-stock.ts` → `notifyUsersOfProviderFailure()`

**Operations**:
- **Read + Write**: One get + one put per provider failure per symbol
- **Frequency**: Only when external provider fails (should be rare)

**Impact**: 🟢 **LOW**
- Only triggers on provider failures
- Uses expiration TTL (auto-cleanup)
- Not a frequent operation

---

## Optimization Opportunities

### 🎯 Priority 1: Cache Admin Config in Memory

**Problem**: `getConfig()` is called on every stock request, causing excessive KV reads.

**Solution**: Add in-memory cache for config with TTL.

**Expected Savings**:
- Reduces KV reads from ~1000/day to ~1/day (only on actual config updates)
- Config changes are rare, so cache invalidation is simple

**Implementation**:
```typescript
// In-memory cache for config
let cachedConfig: AdminConfig | null = null;
let configCachedAt: number = 0;
const CONFIG_CACHE_TTL_MS = 60 * 1000; // 1 minute TTL

export async function getConfig(env: Env): Promise<AdminConfig> {
  const now = Date.now();
  
  // Return cached config if still valid
  if (cachedConfig && (now - configCachedAt) < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }
  
  // Fetch from KV and cache
  // ... existing KV read logic ...
  cachedConfig = configFromKV;
  configCachedAt = now;
  return cachedConfig;
}

export async function updateConfig(env: Env, updates: Partial<AdminConfig>): Promise<AdminConfig> {
  // Invalidate cache on update
  cachedConfig = null;
  // ... existing update logic ...
}
```

**Cost Savings**: 
- Before: 1000 requests = 1000 KV reads
- After: 1000 requests = ~0-1 KV reads (depending on TTL)

---

### 🎯 Priority 2: Move Config to D1 Database

**Problem**: Config is small, read-heavy, write-light - perfect for D1 instead of KV.

**Solution**: Store admin config in D1 table instead of KV.

**Pros**:
- D1 reads are included in free tier (unlimited reads)
- Simpler to query and update
- Can use SQL transactions

**Cons**:
- Need to create migration
- Slightly slower than KV (but negligible for small data)

**Implementation**:
```sql
CREATE TABLE admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**Cost Savings**: 
- KV reads cost money, D1 reads are free (within limits)

---

### 🎯 Priority 3: Batch Alert State Reads

**Problem**: Cron job reads alert state one-by-one in a loop.

**Current**: 
```typescript
for (const alert of alerts) {
  const snapshot = await readAlertState(kv, alert.id); // N KV reads
}
```

**Solution**: Use `kv.list()` to fetch all alert states in one operation (if patterns allow).

**Note**: KV `list()` requires prefix matching, so we'd need to structure keys as:
- Current: `alert:{id}:state`
- Better: `alert:state:{id}` (allows prefix `alert:state:`)

**Cost Savings**:
- Before: 10 alerts = 10 KV reads
- After: 10 alerts = 1 KV list operation

---

### 🎯 Priority 4: Use D1 for Alert State

**Problem**: Alert state is also read-heavy, write-light.

**Solution**: Store alert state in D1 table.

**Pros**:
- Can query multiple states with one SQL query
- Free reads (within limits)
- Easier to debug and inspect

**Implementation**:
```sql
CREATE TABLE alert_state (
  alert_id TEXT PRIMARY KEY,
  last_triggered_at INTEGER,
  trigger_count INTEGER,
  last_price REAL,
  updated_at INTEGER
);
```

---

## Recommended Implementation Order

1. ✅ **Priority 1**: Implement in-memory cache for config (Quick win, immediate savings)
2. **Priority 2**: Move config to D1 (Bigger refactor, but eliminates config KV costs entirely)
3. **Priority 3**: Batch alert state reads (Medium effort, moderate savings)
4. **Priority 4**: Move alert state to D1 (Bigger refactor, but good long-term)

---

## Current KV Cost Estimate

Assuming:
- 1000 stock API requests/day
- 10 active alerts
- Cron runs every 5 minutes (288 times/day)

**Daily KV Operations**:
- Config reads: 1000 (from stock requests)
- Alert state reads: 10 × 288 = 2,880 (cron job)
- Alert state writes: ~50 (assuming some alerts trigger)
- Config writes: ~5 (admin updates)
- Provider failure: ~10 (rare failures)

**Total**: ~3,945 KV operations/day

**With Priority 1 optimization**:
- Config reads: ~1 (only on cache miss)
- Everything else: same

**Total**: ~2,946 KV operations/day (**25% reduction**)

**With Priority 1 + 2 optimizations**:
- Config reads: 0 (moved to D1)
- Everything else: same

**Total**: ~1,946 KV operations/day (**51% reduction**)

---

## Quick Win Implementation

The in-memory cache (Priority 1) can be implemented immediately with minimal code changes and provides significant savings.

