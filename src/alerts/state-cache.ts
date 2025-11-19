/**
 * In-memory cache for alert states to reduce KV reads/writes
 * 
 * This module provides a caching layer that:
 * 1. Caches alert states in memory (loaded from KV on demand)
 * 2. Batches KV writes (updates KV once per hour instead of every cron run)
 * 3. Reduces KV operations by 90%+
 */

import type { AlertStateSnapshot } from "./types";

// In-memory cache for alert states
const stateCache = new Map<string, AlertStateSnapshot>();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Pending writes queue (batched KV updates)
const pendingWrites = new Map<string, AlertStateSnapshot>();
let lastKvWriteTime = 0;
const DEFAULT_KV_WRITE_INTERVAL_MS = 60 * 60 * 1000; // Default: 1 hour

/**
 * Load all alert states from KV into memory cache
 * This is called once when cache is empty or expired
 */
export async function loadAllStatesFromKV(
  kv: KVNamespace,
  alertIds: string[]
): Promise<Record<string, AlertStateSnapshot>> {
  const now = Date.now();
  
  // Return cached data if still fresh (within 1 hour)
  if (stateCache.size > 0 && (now - cacheLoadedAt) < CACHE_TTL_MS) {
    const result: Record<string, AlertStateSnapshot> = {};
    for (const id of alertIds) {
      const cached = stateCache.get(id);
      if (cached) {
        result[id] = cached;
      }
    }
    return result;
  }

  // Load from KV (only happens once per hour or on cache miss)
  console.log(`[KV Cache] Loading ${alertIds.length} alert states from KV...`);
  const state: Record<string, AlertStateSnapshot> = {};
  
  // Read all states in parallel
  const readPromises = alertIds.map(async (id) => {
    try {
      const key = `alert:${id}:state`;
      const raw = await kv.get(key);
      if (raw) {
        const parsed = JSON.parse(raw) as AlertStateSnapshot;
        stateCache.set(id, parsed); // Cache in memory
        return { id, state: parsed };
      }
    } catch (error) {
      console.warn(`[KV Cache] Failed to load state for alert ${id}:`, error);
    }
    return null;
  });

  const results = await Promise.all(readPromises);
  for (const result of results) {
    if (result) {
      state[result.id] = result.state;
    }
  }

  cacheLoadedAt = now;
  console.log(`[KV Cache] Loaded ${Object.keys(state).length} states from KV`);
  
  return state;
}

/**
 * Get alert state from in-memory cache (no KV read)
 */
export function getCachedState(id: string): AlertStateSnapshot | null {
  return stateCache.get(id) || null;
}

/**
 * Update alert state in memory cache and queue for batched KV write
 * This does NOT write to KV immediately - writes are batched
 */
export function updateStateInCache(
  id: string,
  snapshot: AlertStateSnapshot
): void {
  // Update in-memory cache immediately
  stateCache.set(id, snapshot);
  
  // Queue for batched KV write
  pendingWrites.set(id, snapshot);
  
  console.log(`[KV Cache] Queued state update for alert ${id} (${pendingWrites.size} pending writes)`);
}

/**
 * Write all pending state updates to KV (batched operation)
 * This is called:
 * 1. Automatically when the configured interval has passed since last write
 * 2. Manually when needed (e.g., on worker shutdown, or forced flush)
 * 
 * @param kv - KV namespace for storing alert states
 * @param kvWriteIntervalSec - Interval in seconds between KV writes (default: 3600 = 1 hour)
 */
export async function flushPendingWritesToKV(
  kv: KVNamespace,
  kvWriteIntervalSec: number = 3600
): Promise<void> {
  if (pendingWrites.size === 0) {
    return;
  }

  const now = Date.now();
  const timeSinceLastWrite = now - lastKvWriteTime;
  const kvWriteIntervalMs = kvWriteIntervalSec * 1000;
  
  // Only write if the configured interval has passed since last write
  if (timeSinceLastWrite < kvWriteIntervalMs) {
    console.log(`[KV Cache] Skipping KV write - only ${Math.floor(timeSinceLastWrite / 1000)}s since last write (interval: ${kvWriteIntervalSec}s)`);
    return;
  }

  const pendingCount = pendingWrites.size;
  console.log(`[KV Cache] Flushing ${pendingCount} pending writes to KV...`);
  
  // Write all pending states to KV in parallel
  const writePromises = Array.from(pendingWrites.entries()).map(async ([id, snapshot]) => {
    try {
      const key = `alert:${id}:state`;
      await kv.put(key, JSON.stringify(snapshot));
      return id;
    } catch (error) {
      console.error(`[KV Cache] Failed to write state for alert ${id}:`, error);
      return null;
    }
  });

  const written = await Promise.all(writePromises);
  const successCount = written.filter(id => id !== null).length;
  
  // Clear pending writes after successful write
  pendingWrites.clear();
  lastKvWriteTime = now;
  
  console.log(`[KV Cache] Flushed ${successCount}/${pendingCount} writes to KV`);
}

/**
 * Invalidate cached state for an alert (e.g., when alert is deleted)
 */
export function invalidateState(id: string): void {
  stateCache.delete(id);
  pendingWrites.delete(id);
}

/**
 * Clear all cached states (useful for testing or forced refresh)
 */
export function clearCache(): void {
  stateCache.clear();
  pendingWrites.clear();
  cacheLoadedAt = 0;
  lastKvWriteTime = 0;
}

/**
 * Get cache statistics (useful for monitoring)
 */
export function getCacheStats() {
  return {
    cachedStates: stateCache.size,
    pendingWrites: pendingWrites.size,
    cacheAge: cacheLoadedAt > 0 ? Date.now() - cacheLoadedAt : 0,
    timeSinceLastKvWrite: lastKvWriteTime > 0 ? Date.now() - lastKvWriteTime : 0,
  };
}

