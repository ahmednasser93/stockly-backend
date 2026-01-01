/**
 * Market Service
 * Service layer with caching logic for market data
 */

import type { MarketRepository } from '../repositories/external/MarketRepository';
import type { MarketStockItem, SectorPerformanceItem } from '@stockly/shared/types';
import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { getMarketDataFromKV, setMarketDataToKV, getSectorsDataFromKV, setSectorsDataToKV, getStaleMarketDataFromKV, getStaleSectorsDataFromKV, getMarketDataSliceFromKV } from '../api/market-cache';
import { getConfig } from '../api/config';
import { isWithinWorkingHours } from '../utils/working-hours';
import { kvGetWithWorkingHours, kvPutWithWorkingHours } from '../utils/kv-working-hours';
import { createCommonStocksService } from '../factories/createCommonStocksService';
import { MarketCalculationService } from './market-calculation.service';

export class MarketService {
  constructor(
    private repository: MarketRepository,
    private env: Env,
    private logger?: Logger
  ) {}

  /**
   * Get cache TTL values from config (with defaults)
   */
  private async getCacheTTLs(): Promise<{ marketData: number; sectors: number }> {
    const config = await getConfig(this.env);
    return {
      marketData: config.marketCache?.marketDataTtlSec ?? 300, // Default: 5 minutes
      sectors: config.marketCache?.sectorsTtlSec ?? 2700, // Default: 45 minutes
    };
  }

  /**
   * Get gainers with caching
   * Uses new cache keys: market:gainers:top50 (fast) and market:gainers:full (for pagination)
   * Fallback: FMP primary, then 500-stock calculation
   */
  async getGainers(limit: number = 10, offset: number = 0): Promise<MarketStockItem[]> {
    const top50CacheKey = 'market:gainers:top50';
    const fullCacheKey = 'market:gainers:full';
    const kv = this.env.marketKv;
    const ttl = (await this.getCacheTTLs()).marketData;
    const config = await getConfig(this.env);

    // Check top50 cache first for fast response (when offset=0 and limit <= 50)
    if (kv && offset === 0 && limit <= 50) {
      const cached = await getMarketDataFromKV(kv, top50CacheKey, config);
      if (cached) {
        this.logger?.info('Cache hit for market gainers (top50)', {
          cachedAt: cached.cachedAt,
        });
        return cached.data.slice(0, limit);
      }
    }

    // Check full cache for pagination or larger requests
    if (kv) {
      if (offset > 0 || limit > 50) {
        // Need full cache for pagination
        const cached = await getMarketDataFromKV(kv, fullCacheKey, config);
        if (cached) {
          this.logger?.info('Cache hit for market gainers (full)', {
            cachedAt: cached.cachedAt,
          });
          return cached.data.slice(offset, offset + limit);
        }
      } else {
        // Try full cache as fallback
        const cached = await getMarketDataFromKV(kv, fullCacheKey, config);
        if (cached) {
          this.logger?.info('Cache hit for market gainers (full)', {
            cachedAt: cached.cachedAt,
          });
          return cached.data.slice(0, limit);
        }
      }
    }

    // Cache miss - log it
    this.logger?.info('No cached data for gainers, fetching from data lake');

    // Try FMP API first (primary)
    try {
      const data = await this.repository.getGainers();
      
      // Store in cache (non-blocking)
      if (kv) {
        const top50 = data.slice(0, 50);
        setMarketDataToKV(kv, top50CacheKey, top50, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache market gainers top50', error);
        });
        setMarketDataToKV(kv, fullCacheKey, data, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache market gainers full', error);
        });
      }
      
      return data.slice(offset, offset + limit);
    } catch (error) {
      this.logger?.warn('FMP endpoint failed for gainers, trying 500-stock calculation fallback', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback: Calculate from 500 common stocks
      try {
        const commonStocksService = createCommonStocksService(this.env, this.logger);
        const commonStocks = await commonStocksService.getAllActiveStocks();
        const symbols = commonStocks.map((stock) => stock.symbol);

        const allStocks = await this.repository.fetchPricesForStocks(symbols);
        const calculationService = new MarketCalculationService();
        const data = calculationService.calculateGainers(allStocks);

        // Store in cache (non-blocking)
        if (kv) {
          const top50 = data.slice(0, 50);
          setMarketDataToKV(kv, top50CacheKey, top50, config, ttl).catch(error => {
            this.logger?.warn('Failed to cache market gainers top50 (fallback)', error);
          });
          setMarketDataToKV(kv, fullCacheKey, data, config, ttl).catch(error => {
            this.logger?.warn('Failed to cache market gainers full (fallback)', error);
          });
        }

        return data.slice(offset, offset + limit);
      } catch (fallbackError) {
        this.logger?.error('500-stock calculation fallback failed for gainers', fallbackError);
        // Try stale cache as last resort
        if (kv) {
          const stale = await getStaleMarketDataFromKV(kv, fullCacheKey, config);
          if (stale) {
            this.logger?.warn('Using stale cache for gainers as last resort', {
              cachedAt: stale.cachedAt,
            });
            return stale.data.slice(offset, offset + limit);
          }
        }
        return [];
      }
    }
  }

  /**
   * Get losers with caching
   * Uses new cache keys: market:losers:top50 (fast) and market:losers:full (for pagination)
   * Fallback: FMP primary, then 500-stock calculation
   */
  async getLosers(limit: number = 10, offset: number = 0): Promise<MarketStockItem[]> {
    const top50CacheKey = 'market:losers:top50';
    const fullCacheKey = 'market:losers:full';
    const kv = this.env.marketKv;
    const ttl = (await this.getCacheTTLs()).marketData;
    const config = await getConfig(this.env);

    // Check top50 cache first for fast response (when offset=0 and limit <= 50)
    if (kv && offset === 0 && limit <= 50) {
      const cached = await getMarketDataFromKV(kv, top50CacheKey, config);
      if (cached) {
        this.logger?.info('Cache hit for market losers (top50)', {
          cachedAt: cached.cachedAt,
        });
        return cached.data.slice(0, limit);
      }
    }

    // Check full cache for pagination or larger requests
    if (kv) {
      if (offset > 0 || limit > 50) {
        const cached = await getMarketDataFromKV(kv, fullCacheKey, config);
        if (cached) {
          this.logger?.info('Cache hit for market losers (full)', {
            cachedAt: cached.cachedAt,
          });
          return cached.data.slice(offset, offset + limit);
        }
      } else {
        const cached = await getMarketDataFromKV(kv, fullCacheKey, config);
        if (cached) {
          this.logger?.info('Cache hit for market losers (full)', {
            cachedAt: cached.cachedAt,
          });
          return cached.data.slice(0, limit);
        }
      }
    }

    // Cache miss - log it
    this.logger?.info('No cached data for losers, fetching from data lake');

    // Try FMP API first (primary)
    try {
      const data = await this.repository.getLosers();
      
      // Store in cache (non-blocking)
      if (kv) {
        const top50 = data.slice(0, 50);
        setMarketDataToKV(kv, top50CacheKey, top50, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache market losers top50', error);
        });
        setMarketDataToKV(kv, fullCacheKey, data, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache market losers full', error);
        });
      }
      
      return data.slice(offset, offset + limit);
    } catch (error) {
      this.logger?.warn('FMP endpoint failed for losers, trying 500-stock calculation fallback', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback: Calculate from 500 common stocks
      try {
        const commonStocksService = createCommonStocksService(this.env, this.logger);
        const commonStocks = await commonStocksService.getAllActiveStocks();
        const symbols = commonStocks.map((stock) => stock.symbol);

        const allStocks = await this.repository.fetchPricesForStocks(symbols);
        const calculationService = new MarketCalculationService();
        const data = calculationService.calculateLosers(allStocks);

        // Store in cache (non-blocking)
        if (kv) {
          const top50 = data.slice(0, 50);
          setMarketDataToKV(kv, top50CacheKey, top50, config, ttl).catch(error => {
            this.logger?.warn('Failed to cache market losers top50 (fallback)', error);
          });
          setMarketDataToKV(kv, fullCacheKey, data, config, ttl).catch(error => {
            this.logger?.warn('Failed to cache market losers full (fallback)', error);
          });
        }

        return data.slice(offset, offset + limit);
      } catch (fallbackError) {
        this.logger?.error('500-stock calculation fallback failed for losers', fallbackError);
        // Try stale cache as last resort
        if (kv) {
          const stale = await getStaleMarketDataFromKV(kv, fullCacheKey, config);
          if (stale) {
            this.logger?.warn('Using stale cache for losers as last resort', {
              cachedAt: stale.cachedAt,
            });
            return stale.data.slice(offset, offset + limit);
          }
        }
        return [];
      }
    }
  }

  /**
   * Get actives with caching
   * Uses new cache keys: market:actives:top50 (fast) and market:actives:full (for pagination)
   * Fallback: FMP primary, then 500-stock calculation
   */
  async getActives(limit: number = 10, offset: number = 0): Promise<MarketStockItem[]> {
    const top50CacheKey = 'market:actives:top50';
    const fullCacheKey = 'market:actives:full';
    const kv = this.env.marketKv;
    const ttl = (await this.getCacheTTLs()).marketData;
    const config = await getConfig(this.env);

    // Check top50 cache first for fast response (when offset=0 and limit <= 50)
    if (kv && offset === 0 && limit <= 50) {
      const cached = await getMarketDataFromKV(kv, top50CacheKey, config);
      if (cached) {
        this.logger?.info('Cache hit for market actives (top50)', {
          cachedAt: cached.cachedAt,
        });
        return cached.data.slice(0, limit);
      }
    }

    // Check full cache for pagination or larger requests
    if (kv) {
      if (offset > 0 || limit > 50) {
        const cached = await getMarketDataFromKV(kv, fullCacheKey, config);
        if (cached) {
          this.logger?.info('Cache hit for market actives (full)', {
            cachedAt: cached.cachedAt,
          });
          return cached.data.slice(offset, offset + limit);
        }
      } else {
        const cached = await getMarketDataFromKV(kv, fullCacheKey, config);
        if (cached) {
          this.logger?.info('Cache hit for market actives (full)', {
            cachedAt: cached.cachedAt,
          });
          return cached.data.slice(0, limit);
        }
      }
    }

    // Cache miss - log it
    this.logger?.info('No cached data for actives, fetching from data lake');

    // Try FMP API first (primary)
    try {
      const data = await this.repository.getActives();
      
      // Store in cache (non-blocking)
      if (kv) {
        const top50 = data.slice(0, 50);
        setMarketDataToKV(kv, top50CacheKey, top50, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache market actives top50', error);
        });
        setMarketDataToKV(kv, fullCacheKey, data, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache market actives full', error);
        });
      }
      
      return data.slice(offset, offset + limit);
    } catch (error) {
      this.logger?.warn('FMP endpoint failed for actives, trying 500-stock calculation fallback', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback: Calculate from 500 common stocks
      try {
        const commonStocksService = createCommonStocksService(this.env, this.logger);
        const commonStocks = await commonStocksService.getAllActiveStocks();
        const symbols = commonStocks.map((stock) => stock.symbol);

        const allStocks = await this.repository.fetchPricesForStocks(symbols);
        const calculationService = new MarketCalculationService();
        const data = calculationService.calculateActives(allStocks);

        // Store in cache (non-blocking)
        if (kv) {
          const top50 = data.slice(0, 50);
          setMarketDataToKV(kv, top50CacheKey, top50, config, ttl).catch(error => {
            this.logger?.warn('Failed to cache market actives top50 (fallback)', error);
          });
          setMarketDataToKV(kv, fullCacheKey, data, config, ttl).catch(error => {
            this.logger?.warn('Failed to cache market actives full (fallback)', error);
          });
        }

        return data.slice(offset, offset + limit);
      } catch (fallbackError) {
        this.logger?.error('500-stock calculation fallback failed for actives', fallbackError);
        // Try stale cache as last resort
        if (kv) {
          const stale = await getStaleMarketDataFromKV(kv, fullCacheKey, config);
          if (stale) {
            this.logger?.warn('Using stale cache for actives as last resort', {
              cachedAt: stale.cachedAt,
            });
            return stale.data.slice(offset, offset + limit);
          }
        }
        return [];
      }
    }
  }

  /**
   * Get screener results with caching
   */
  async getScreener(
    marketCapMoreThan: number = 1000000000,
    peLowerThan: number = 20,
    dividendMoreThan: number = 2,
    limit: number = 50
  ): Promise<MarketStockItem[]> {
    const cacheKey = `market:screener:${marketCapMoreThan}:${peLowerThan}:${dividendMoreThan}:${limit}`;
    const kv = this.env.marketKv;
    const config = await getConfig(this.env);
    const outsideHours = !isWithinWorkingHours(config);

    // Check KV cache first
    if (kv) {
      const cached = await getMarketDataFromKV(kv, cacheKey, config);
      if (cached) {
        this.logger?.info('Cache hit for market screener', {
          cachedAt: cached.cachedAt,
        });
        return cached.data;
      }
    }

    // Outside working hours - return stale cache if available
    if (outsideHours && kv) {
      const stale = await getStaleMarketDataFromKV(kv, cacheKey, config);
      if (stale) {
        this.logger?.info('Outside working hours, returning stale cache for market screener', {
          cachedAt: stale.cachedAt,
        });
        return stale.data;
      }
      // No stale cache available - return empty array
      this.logger?.warn('Outside working hours and no cache available for market screener');
      return [];
    }

    // Cache miss or expired - fetch from FMP (only during working hours)
    try {
      const data = await this.repository.getScreener(marketCapMoreThan, peLowerThan, dividendMoreThan, limit);
      
      // Store in KV cache (non-blocking)
      if (kv) {
        const ttl = (await this.getCacheTTLs()).marketData;
        setMarketDataToKV(kv, cacheKey, data, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache market screener', error);
        });
      }
      
      return data;
    } catch (error) {
      // If FMP fails, try to return stale cache if available
      if (kv) {
        const stale = await getStaleMarketDataFromKV(kv, cacheKey, config);
        if (stale) {
          this.logger?.warn('FMP API failed, returning stale cache for screener');
          return stale.data;
        }
      }
      
      // No cache available, rethrow error
      throw error;
    }
  }

  /**
   * Get sectors performance with caching
   */
  async getSectorsPerformance(): Promise<SectorPerformanceItem[]> {
    const cacheKey = `market:sectors-performance`;
    const kv = this.env.marketKv;
    const ttl = (await this.getCacheTTLs()).sectors;
    const config = await getConfig(this.env);
    const outsideHours = !isWithinWorkingHours(config);

    // Check KV cache first
    if (kv) {
      const cached = await getSectorsDataFromKV(kv, cacheKey, config);
      if (cached) {
        this.logger?.info('Cache hit for sectors performance', {
          cachedAt: cached.cachedAt,
        });
        return cached.data;
      }
    }

    // Outside working hours - return stale cache if available
    if (outsideHours && kv) {
      const stale = await getStaleSectorsDataFromKV(kv, cacheKey, config);
      if (stale) {
        this.logger?.info('Outside working hours, returning stale cache for sectors performance', {
          cachedAt: stale.cachedAt,
        });
        return stale.data;
      }
      // No stale cache available - return empty array
      this.logger?.warn('Outside working hours and no cache available for sectors performance');
      return [];
    }

    // Cache miss or expired - fetch from FMP (only during working hours)
    try {
      const data = await this.repository.getSectorsPerformance();
      
      // Store in KV cache (non-blocking)
      if (kv) {
        setSectorsDataToKV(kv, cacheKey, data, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache sectors performance', error);
        });
      }
      
      return data;
    } catch (error) {
      // If FMP fails, try to return stale cache if available
      if (kv) {
        const stale = await getStaleSectorsDataFromKV(kv, cacheKey, config);
        if (stale) {
          this.logger?.warn('FMP API failed, returning stale cache for sectors performance');
          return stale.data;
        }
      }
      
      // No cache available, rethrow error
      throw error;
    }
  }

  /**
   * Get market status with caching
   * Caching: 5 minutes (increased from 60 seconds to reduce KV writes)
   */
  async getMarketStatus(): Promise<{ isTheStockMarketOpen: boolean }> {
    const cacheKey = 'market:status';
    const kv = this.env.marketKv;
    const ttl = 300; // 5 minutes cache (increased from 60 seconds to reduce KV writes)
    const config = await getConfig(this.env);

    // Check KV cache first
    if (kv) {
      try {
        const raw = await kvGetWithWorkingHours(kv, cacheKey, config);
        if (raw) {
          const entry = JSON.parse(raw) as { data: { isTheStockMarketOpen: boolean }; cachedAt: number; expiresAt: number };
          const now = Date.now();
          if (entry.data && entry.expiresAt && now < entry.expiresAt) {
            this.logger?.info('Cache hit for market status', {
              cachedAt: entry.cachedAt,
            });
            return entry.data;
          }
        }
      } catch (error) {
        // Cache read error - continue to fetch
        this.logger?.warn('Failed to read market status cache', error);
      }
    }

    // Cache miss - fetch from repository
    try {
      const data = await this.repository.getMarketStatus();
      
      // Store in cache (non-blocking)
      if (kv) {
        const now = Date.now();
        const cacheEntry = {
          data,
          cachedAt: now,
          expiresAt: now + ttl * 1000,
        };
        kvPutWithWorkingHours(kv, cacheKey, JSON.stringify(cacheEntry), config).catch(error => {
          this.logger?.warn('Failed to cache market status', error);
        });
      }
      
      return data;
    } catch (error) {
      // If FMP fails, try to return stale cache if available
      if (kv) {
        try {
          const raw = await kvGetWithWorkingHours(kv, cacheKey, config);
          if (raw) {
            const entry = JSON.parse(raw) as { data: { isTheStockMarketOpen: boolean }; cachedAt: number };
            if (entry.data) {
              this.logger?.warn('FMP API failed, returning stale cache for market status');
              return entry.data;
            }
          }
        } catch (cacheError) {
          // Ignore cache read errors
        }
      }
      
      // No cache available, rethrow error
      throw error;
    }
  }

  /**
   * Get social sentiment with caching
   * Caching: 5 minutes
   */
  async getSocialSentiment(type: 'bullish' | 'bearish' = 'bullish', limit: number = 10, offset: number = 0): Promise<MarketStockItem[]> {
    const cacheKey = `market:social-sentiment:${type}`;
    const kv = this.env.marketKv;
    const ttl = 300; // 5 minutes cache
    const config = await getConfig(this.env);

    // Check KV cache first
    if (kv) {
      const cached = await getMarketDataFromKV(kv, cacheKey, config);
      if (cached) {
        this.logger?.info('Cache hit for social sentiment', {
          type,
          cachedAt: cached.cachedAt,
        });
        return cached.data.slice(offset, offset + limit);
      }
    }

    // Cache miss - fetch from repository
    try {
      const data = await this.repository.getSocialSentiment(type);
      
      // Store in cache (non-blocking)
      if (kv) {
        setMarketDataToKV(kv, cacheKey, data, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache social sentiment', error);
        });
      }
      
      return data.slice(offset, offset + limit);
    } catch (error) {
      // If FMP fails, try to return stale cache if available
      if (kv) {
        const stale = await getStaleMarketDataFromKV(kv, cacheKey, config);
        if (stale) {
          this.logger?.warn('FMP API failed, returning stale cache for social sentiment');
          return stale.data.slice(offset, offset + limit);
        }
      }
      
      // No cache available, rethrow error
      throw error;
    }
  }

  /**
   * Get crypto quotes with caching
   * Caching: 2 minutes (increased from 1 minute to reduce KV writes)
   */
  async getCryptoQuotes(limit: number = 10, offset: number = 0): Promise<MarketStockItem[]> {
    const cacheKey = 'market:crypto-quotes';
    const kv = this.env.marketKv;
    const ttl = 120; // 2 minutes cache (increased from 60 seconds to reduce KV writes)
    const config = await getConfig(this.env);

    // Check KV cache first
    if (kv) {
      const cached = await getMarketDataFromKV(kv, cacheKey, config);
      if (cached) {
        this.logger?.info('Cache hit for crypto quotes', {
          cachedAt: cached.cachedAt,
        });
        return cached.data.slice(offset, offset + limit);
      }
    }

    // Cache miss - fetch from repository
    try {
      const data = await this.repository.getCryptoQuotes();
      
      // Store in cache (non-blocking)
      if (kv) {
        setMarketDataToKV(kv, cacheKey, data, config, ttl).catch(error => {
          this.logger?.warn('Failed to cache crypto quotes', error);
        });
      }
      
      return data.slice(offset, offset + limit);
    } catch (error) {
      // If FMP fails, try to return stale cache if available
      if (kv) {
        const stale = await getStaleMarketDataFromKV(kv, cacheKey, config);
        if (stale) {
          this.logger?.warn('FMP API failed, returning stale cache for crypto quotes');
          return stale.data.slice(offset, offset + limit);
        }
      }
      
      // No cache available, rethrow error
      throw error;
    }
  }
}


