/**
 * In-memory cache for notification throttling to reduce KV reads/writes
 * 
 * This module provides throttling with in-memory cache:
 * - Checks cache first (no KV read if cached)
 * - Only writes to KV when throttling window expires (batched)
 */

// In-memory cache for throttle keys
const throttleCache = new Map<string, number>();
const THROTTLE_WINDOW_SECONDS = 300; // 5 minutes

/**
 * Check if notification should be throttled (from cache, no KV read)
 */
export function isThrottled(key: string): boolean {
  const lastSent = throttleCache.get(key);
  if (!lastSent) {
    return false; // Not throttled - never sent or cache expired
  }

  const now = Math.floor(Date.now() / 1000);
  const timeSinceLastSent = now - lastSent;
  
  return timeSinceLastSent < THROTTLE_WINDOW_SECONDS;
}

/**
 * Mark notification as sent (update cache, queue KV write)
 */
export function markThrottled(key: string): void {
  const now = Math.floor(Date.now() / 1000);
  throttleCache.set(key, now);
}

/**
 * Clear throttle cache for a key
 */
export function clearThrottle(key: string): void {
  throttleCache.delete(key);
}

/**
 * Get throttle cache statistics
 */
export function getThrottleCacheStats() {
  return {
    cachedKeys: throttleCache.size,
  };
}

