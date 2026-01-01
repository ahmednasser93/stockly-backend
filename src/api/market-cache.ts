/**
 * Market Cache Helper
 * KV cache utilities for market data (gainers, losers, actives, sectors)
 * Skips KV operations outside working hours to save on KV operations
 */

import type { KVNamespace } from '@cloudflare/workers-types';
import type { MarketStockItem, SectorPerformanceItem } from '@stockly/shared/types';
import type { AdminConfig } from './config';
import { kvGetWithWorkingHours, kvPutWithWorkingHours } from '../utils/kv-working-hours';

interface MarketCacheEntry {
  data: MarketStockItem[];
  cachedAt: number; // Timestamp when data was cached (milliseconds)
  expiresAt: number; // Timestamp when cache expires (milliseconds)
}

const DEFAULT_TTL_SECONDS = 300; // 5 minutes

/**
 * Get market data from KV cache if valid (not expired)
 * Returns null if cache miss, expired, or outside working hours
 */
export async function getMarketDataFromKV(
  kv: KVNamespace | undefined,
  key: string,
  config: AdminConfig
): Promise<{ data: MarketStockItem[]; cachedAt: number } | null> {
  try {
    const raw = await kvGetWithWorkingHours(kv, key, config);
    if (!raw) {
      return null; // Cache miss
    }

    const entry = JSON.parse(raw) as MarketCacheEntry;
    
    // Validate cache entry structure
    if (!entry.data || !entry.cachedAt || !entry.expiresAt) {
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
    console.warn(`[Market Cache] Failed to read cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Get market data from KV cache even if expired (stale cache)
 * Returns null only if cache miss, invalid entry, or outside working hours
 */
export async function getStaleMarketDataFromKV(
  kv: KVNamespace | undefined,
  key: string,
  config: AdminConfig
): Promise<{ data: MarketStockItem[]; cachedAt: number } | null> {
  try {
    const raw = await kvGetWithWorkingHours(kv, key, config);
    if (!raw) {
      return null; // Cache miss
    }

    const entry = JSON.parse(raw) as MarketCacheEntry;
    
    // Validate cache entry structure
    if (!entry.data || !entry.cachedAt) {
      return null; // Invalid cache entry
    }

    // Return even if expired (stale cache)
    return {
      data: entry.data,
      cachedAt: entry.cachedAt,
    };
  } catch (error) {
    // Invalid JSON or other error - treat as cache miss
    console.warn(`[Market Cache] Failed to read stale cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Store market data in KV with TTL
 * Skips write outside working hours to save on KV operations
 */
export async function setMarketDataToKV(
  kv: KVNamespace | undefined,
  key: string,
  data: MarketStockItem[],
  config: AdminConfig,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  try {
    const now = Date.now();
    const cacheEntry: MarketCacheEntry = {
      data,
      cachedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    };

    await kvPutWithWorkingHours(kv, key, JSON.stringify(cacheEntry), config, { expirationTtl: ttlSeconds });
  } catch (error) {
    console.error(`[Market Cache] Failed to write cache for key ${key}:`, error);
    // Don't throw - caching is best-effort
  }
}

interface SectorCacheEntry {
  data: SectorPerformanceItem[];
  cachedAt: number; // Timestamp when data was cached (milliseconds)
  expiresAt: number; // Timestamp when cache expires (milliseconds)
}

/**
 * Get sector performance data from KV cache if valid (not expired)
 * Returns null if cache miss, expired, or outside working hours
 */
export async function getSectorsDataFromKV(
  kv: KVNamespace | undefined,
  key: string,
  config: AdminConfig
): Promise<{ data: SectorPerformanceItem[]; cachedAt: number } | null> {
  try {
    const raw = await kvGetWithWorkingHours(kv, key, config);
    if (!raw) {
      return null; // Cache miss
    }

    const entry = JSON.parse(raw) as SectorCacheEntry;
    
    // Validate cache entry structure
    if (!entry.data || !entry.cachedAt || !entry.expiresAt) {
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
    console.warn(`[Market Cache] Failed to read cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Get sector performance data from KV cache even if expired (stale cache)
 * Returns null only if cache miss, invalid entry, or outside working hours
 */
export async function getStaleSectorsDataFromKV(
  kv: KVNamespace | undefined,
  key: string,
  config: AdminConfig
): Promise<{ data: SectorPerformanceItem[]; cachedAt: number } | null> {
  try {
    const raw = await kvGetWithWorkingHours(kv, key, config);
    if (!raw) {
      return null; // Cache miss
    }

    const entry = JSON.parse(raw) as SectorCacheEntry;
    
    // Validate cache entry structure
    if (!entry.data || !entry.cachedAt) {
      return null; // Invalid cache entry
    }

    // Return even if expired (stale cache)
    return {
      data: entry.data,
      cachedAt: entry.cachedAt,
    };
  } catch (error) {
    // Invalid JSON or other error - treat as cache miss
    console.warn(`[Market Cache] Failed to read stale cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Store sector performance data in KV with TTL
 * Skips write outside working hours to save on KV operations
 */
export async function setSectorsDataToKV(
  kv: KVNamespace | undefined,
  key: string,
  data: SectorPerformanceItem[],
  config: AdminConfig,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  try {
    const now = Date.now();
    const cacheEntry: SectorCacheEntry = {
      data,
      cachedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    };

    await kvPutWithWorkingHours(kv, key, JSON.stringify(cacheEntry), config, { expirationTtl: ttlSeconds });
  } catch (error) {
    console.error(`[Market Cache] Failed to write cache for key ${key}:`, error);
    // Don't throw - caching is best-effort
  }
}

/**
 * Get paginated slice from full cache
 * Returns null if cache miss, expired, or outside working hours
 */
export async function getMarketDataSliceFromKV(
  kv: KVNamespace | undefined,
  key: string,
  offset: number,
  limit: number,
  config: AdminConfig
): Promise<{ data: MarketStockItem[]; cachedAt: number; total: number } | null> {
  const cached = await getMarketDataFromKV(kv, key, config);
  if (!cached) {
    return null;
  }

  const sliced = cached.data.slice(offset, offset + limit);
  return {
    data: sliced,
    cachedAt: cached.cachedAt,
    total: cached.data.length,
  };
}

/**
 * Store full list of market data in KV
 * Skips write outside working hours to save on KV operations
 */
export async function setMarketDataFullToKV(
  kv: KVNamespace | undefined,
  key: string,
  data: MarketStockItem[],
  config: AdminConfig,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  return setMarketDataToKV(kv, key, data, config, ttlSeconds);
}

/**
 * Store top 50 slice of market data in KV (for fast responses)
 * Skips write outside working hours to save on KV operations
 */
export async function setMarketDataTop50ToKV(
  kv: KVNamespace | undefined,
  key: string,
  data: MarketStockItem[],
  config: AdminConfig,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  const top50 = data.slice(0, 50);
  return setMarketDataToKV(kv, key, top50, config, ttlSeconds);
}

/**
 * Update a stock's price in cached market data if it exists
 * Updates all cache keys that might contain this stock (gainers, losers, actives)
 * Skips updates outside working hours to save on KV operations
 */
export async function updateStockPriceInCache(
  kv: KVNamespace | undefined,
  symbol: string,
  newPrice: number,
  newChange: number | null,
  newChangePercent: number | null,
  newVolume: number | null,
  config: AdminConfig
): Promise<number> {
  const cacheKeys = [
    'market:gainers:full',
    'market:gainers:top50',
    'market:losers:full',
    'market:losers:top50',
    'market:actives:full',
    'market:actives:top50',
  ];

  let updatedCount = 0;

  for (const key of cacheKeys) {
    try {
      const cached = await getMarketDataFromKV(kv, key, config);
      if (!cached) {
        continue; // Cache miss or expired, skip
      }

      // Find and update the stock in the cached data
      let found = false;
      const updatedData = cached.data.map((item) => {
        if (item.symbol === symbol.toUpperCase()) {
          found = true;
          return {
            ...item,
            price: newPrice,
            change: newChange ?? item.change,
            changesPercentage: newChangePercent ?? item.changesPercentage,
            volume: newVolume ?? item.volume,
          };
        }
        return item;
      });

      if (found) {
        // Update the cache with modified data
        await setMarketDataToKV(kv, key, updatedData, config, DEFAULT_TTL_SECONDS);
        updatedCount++;
      }
    } catch (error) {
      console.warn(`[Market Cache] Failed to update stock price in cache for key ${key}:`, error);
      // Continue with other keys
    }
  }

  return updatedCount;
}

/**
 * Refresh market cache if any of the updated stocks exist in the cache
 * Non-blocking operation - returns immediately
 * Skips refresh outside working hours to save on KV operations
 */
export async function refreshMarketCacheIfNeeded(
  kv: KVNamespace | undefined,
  updatedStocks: Array<{
    symbol: string;
    price: number;
    change?: number | null;
    changePercent?: number | null;
    volume?: number | null;
  }>,
  config: AdminConfig
): Promise<void> {
  // This is a fire-and-forget operation
  // We update each stock in parallel and don't wait for completion
  Promise.allSettled(
    updatedStocks.map((stock) =>
      updateStockPriceInCache(
        kv,
        stock.symbol,
        stock.price,
        stock.change ?? null,
        stock.changePercent ?? null,
        stock.volume ?? null,
        config
      )
    )
  ).catch((error) => {
    console.warn('[Market Cache] Error refreshing market cache:', error);
  });
}

