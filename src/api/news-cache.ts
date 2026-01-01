/**
 * News Cache Helper
 * KV cache utilities for general news data
 * Skips KV operations outside working hours to save on KV operations
 */

import type { KVNamespace } from '@cloudflare/workers-types';
import type { NewsItem, NewsPagination, NewsOptions } from '@stockly/shared/types';
import type { AdminConfig } from './config';
import { kvGetWithWorkingHours, kvPutWithWorkingHours } from '../utils/kv-working-hours';
import { flushPendingWritesToKV } from '../alerts/state-cache';

interface NewsCacheEntry {
  data: {
    news: NewsItem[];
    pagination: NewsPagination;
  };
  cachedAt: number; // Timestamp when data was cached (milliseconds)
  expiresAt: number; // Timestamp when cache expires (milliseconds)
}

const DEFAULT_TTL_SECONDS = 3600; // 1 hour

/**
 * Get news data from KV cache if valid (not expired)
 * Returns null if cache miss, expired, or outside working hours
 */
export async function getNewsDataFromKV(
  kv: KVNamespace | undefined,
  key: string,
  config: AdminConfig
): Promise<{ data: { news: NewsItem[]; pagination: NewsPagination }; cachedAt: number } | null> {
  try {
    const raw = await kvGetWithWorkingHours(kv, key, config);
    if (!raw) {
      return null; // Cache miss
    }

    const entry = JSON.parse(raw) as NewsCacheEntry;
    
    // Validate cache entry structure
    if (!entry.data || !entry.data.news || !entry.data.pagination || !entry.cachedAt || !entry.expiresAt) {
      return null; // Invalid cache entry
    }

    // Check if expired
    const now = Date.now();
    if (now > entry.expiresAt) {
      return null; // Cache expired
    }

    return {
      data: entry.data,
      cachedAt: entry.cachedAt,
    };
  } catch (error) {
    // Invalid JSON or other error - treat as cache miss
    console.warn(`[News Cache] Failed to read cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Get news data from KV cache even if expired (stale cache)
 * Returns null only if cache miss, invalid entry, or outside working hours
 */
export async function getStaleNewsDataFromKV(
  kv: KVNamespace | undefined,
  key: string,
  config: AdminConfig
): Promise<{ data: { news: NewsItem[]; pagination: NewsPagination }; cachedAt: number } | null> {
  try {
    const raw = await kvGetWithWorkingHours(kv, key, config);
    if (!raw) {
      return null; // Cache miss
    }

    const entry = JSON.parse(raw) as NewsCacheEntry;
    
    // Validate cache entry structure
    if (!entry.data || !entry.data.news || !entry.data.pagination || !entry.cachedAt) {
      return null; // Invalid cache entry
    }

    // Return even if expired (stale cache)
    return {
      data: entry.data,
      cachedAt: entry.cachedAt,
    };
  } catch (error) {
    // Invalid JSON or other error - treat as cache miss
    console.warn(`[News Cache] Failed to read stale cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Store news data in KV with TTL
 * Skips write outside working hours to save on KV operations
 */
export async function setNewsDataToKV(
  kv: KVNamespace | undefined,
  key: string,
  data: { news: NewsItem[]; pagination: NewsPagination },
  config: AdminConfig,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  try {
    const now = Date.now();
    const cacheEntry: NewsCacheEntry = {
      data,
      cachedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    };

    await kvPutWithWorkingHours(kv, key, JSON.stringify(cacheEntry), config, { expirationTtl: ttlSeconds });
  } catch (error) {
    console.error(`[News Cache] Failed to write cache for key ${key}:`, error);
    // Don't throw - caching is best-effort
  }
}

/**
 * Generate cache key for news based on symbols and options
 * Used by NewsRepository for backward compatibility
 */
export function generateCacheKey(symbols: string[], options?: NewsOptions): string {
  const parts = ['news'];
  if (symbols.length > 0 && symbols[0] !== 'general') {
    parts.push(...symbols.sort());
  } else {
    parts.push('general');
  }
  if (options?.page !== undefined) {
    parts.push(`page:${options.page}`);
  }
  if (options?.limit !== undefined) {
    parts.push(`limit:${options.limit}`);
  }
  return parts.join(':');
}

/**
 * Get cached news from KV (legacy function for NewsRepository compatibility)
 * Uses pollingIntervalSec to determine if cache is still valid
 * Skips KV read outside working hours to save on KV operations
 */
export async function getCachedNews(
  kv: KVNamespace | undefined,
  key: string,
  pollingIntervalSec: number,
  config: AdminConfig
): Promise<{ data: { news: NewsItem[]; pagination: NewsPagination }; cachedAt: number } | null> {
  if (!kv) {
    return null;
  }

  const cached = await getNewsDataFromKV(kv, key, config);
  if (!cached) {
    return null;
  }

  // Check if cache age is less than polling interval
  const ageSeconds = (Date.now() - cached.cachedAt) / 1000;
  if (ageSeconds >= pollingIntervalSec) {
    return null; // Cache is too old based on polling interval
  }

  return cached;
}

/**
 * Update news in cache (legacy function for NewsRepository compatibility)
 * This is a no-op wrapper - actual caching is handled by NewsService
 */
export function updateNewsInCache(
  key: string,
  data: {
    symbols: string[];
    news: NewsItem[];
    pagination: NewsPagination;
    cachedAt: number;
  }
): void {
  // This is a legacy function - NewsRepository uses it but actual caching
  // is now handled by NewsService using setNewsDataToKV
  // Keeping as no-op for backward compatibility
}

// Re-export flushPendingWritesToKV for NewsRepository
export { flushPendingWritesToKV };
