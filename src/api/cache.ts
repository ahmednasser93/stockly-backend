interface CacheEntry {
  data: any;
  cachedAt: number; // Timestamp when data was cached (milliseconds)
  expiresAt: number; // Timestamp when cache expires (milliseconds)
}

const cache: Map<string, CacheEntry> = new Map();

export function setCache(key: string, data: any, ttlSeconds: number) {
  const now = Date.now();
  cache.set(key, {
    data,
    cachedAt: now,
    expiresAt: now + ttlSeconds * 1000,
  });
}

export function getCache(key: string) {
  const entry = getCacheEntry(key);
  if (!entry) return null;
  if (entry.expired) return null;
  return entry.data;
}

/**
 * Get cache entry with metadata (cachedAt timestamp, expired status)
 */
export function getCacheEntry(key: string): { data: any; cachedAt: number; expired: boolean } | null {
  const entry = cache.get(key);
  if (!entry) return null;

  const expired = Date.now() > entry.expiresAt;
  if (expired) {
    cache.delete(key);
    return { data: entry.data, cachedAt: entry.cachedAt, expired: true };
  }

  return { data: entry.data, cachedAt: entry.cachedAt, expired: false };
}

/**
 * Check if cache entry is still valid based on polling interval
 * Returns null if cache should be refreshed (age >= pollingIntervalSec)
 */
export function getCacheIfValid(
  key: string,
  pollingIntervalSec: number
): { data: any; cachedAt: number } | null {
  const entry = cache.get(key);
  if (!entry) return null;

  const now = Date.now();
  const ageSeconds = (now - entry.cachedAt) / 1000;

  // If cache age is less than polling interval, return cached data
  if (ageSeconds < pollingIntervalSec) {
    return { data: entry.data, cachedAt: entry.cachedAt };
  }

  // Cache is too old, should be refreshed
  // Don't delete it here - let the caller handle fetching new data
  return null;
}

export function clearCache() {
  cache.clear();
}
