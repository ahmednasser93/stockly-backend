/**
 * Stock Service
 * Contains business logic for stock operations
 */

import type { IStockRepository } from '../repositories/interfaces/IStockRepository';
import type { StockDetails } from '@stockly/shared/types';
import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { getConfig } from '../api/config';
import { isWithinWorkingHours } from '../utils/working-hours';
import { getStaleCacheEntry, setCache, getCacheIfValid } from '../api/cache';

export class StockService {
  constructor(
    private stockRepo: IStockRepository,
    private env?: Env,
    private logger?: Logger
  ) {}

  /**
   * Get stock details by symbol
   * Business logic: Validate symbol format
   */
  async getStockDetails(symbol: string): Promise<StockDetails> {
    // Validate symbol format
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0 || normalizedSymbol.length > 10) {
      throw new Error('Invalid symbol format');
    }

    // Check working hours
    let outsideHours = false;
    if (this.env) {
      const config = await getConfig(this.env);
      outsideHours = !isWithinWorkingHours(config);

      // Outside working hours - try to get stale cache
      if (outsideHours) {
        const cacheKey = `stock-details:${normalizedSymbol}`;
        const staleCache = getStaleCacheEntry(cacheKey);
        if (staleCache && staleCache.data) {
          this.logger?.info('Outside working hours, returning stale cache for stock details', {
            symbol: normalizedSymbol,
            cachedAt: staleCache.cachedAt,
          });
          return { ...staleCache.data, cached: true } as StockDetails;
        }
        // No stale cache available
        this.logger?.warn('Outside working hours and no cache available for stock details', {
          symbol: normalizedSymbol,
        });
        throw new Error('Stock details unavailable outside working hours - no cached data available');
      }
    }

    return this.stockRepo.getStockDetails(normalizedSymbol);
  }

  /**
   * Watch stock details for real-time updates
   */
  async watchStockDetails(symbol: string): Promise<AsyncIterable<StockDetails>> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0 || normalizedSymbol.length > 10) {
      throw new Error('Invalid symbol format');
    }

    // Note: watchStockDetails is a stream, so working hours check is less applicable
    // But we can still check and return cached data if outside hours
    if (this.env) {
      const config = await getConfig(this.env);
      const outsideHours = !isWithinWorkingHours(config);
      
      if (outsideHours) {
        // For streams, we'll still allow them but they'll use cached data
        // The repository will handle this
        this.logger?.info('Outside working hours - watch stream will use cached data', {
          symbol: normalizedSymbol,
        });
      }
    }

    return this.stockRepo.watchStockDetails(normalizedSymbol);
  }

  /**
   * Get key executives for a stock
   * Caching: 24 hours (executives change infrequently)
   */
  async getKeyExecutives(symbol: string): Promise<any[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0 || normalizedSymbol.length > 10) {
      throw new Error('Invalid symbol format');
    }

    const cacheKey = `stock:executives:${normalizedSymbol}`;
    const ttl = 86400; // 24 hours

    // Check in-memory cache first
    const cached = getCacheIfValid(cacheKey, ttl);
    if (cached) {
      this.logger?.info('Cache hit for key executives', {
        symbol: normalizedSymbol,
        cachedAt: cached.cachedAt,
      });
      return cached.data as any[];
    }

    // Fetch from repository
    const data = await this.stockRepo.getKeyExecutives(normalizedSymbol);

    // Cache the result
    setCache(cacheKey, data, ttl);

    return data;
  }

  /**
   * Get analyst estimates for a stock
   * Caching: 1 hour (estimates update periodically)
   */
  async getAnalystEstimates(symbol: string, period: 'annual' | 'quarter' = 'annual'): Promise<any[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0 || normalizedSymbol.length > 10) {
      throw new Error('Invalid symbol format');
    }

    const cacheKey = `stock:analyst-estimates:${normalizedSymbol}:${period}`;
    const ttl = 3600; // 1 hour

    // Check in-memory cache first
    const cached = getCacheIfValid(cacheKey, ttl);
    if (cached) {
      this.logger?.info('Cache hit for analyst estimates', {
        symbol: normalizedSymbol,
        period,
        cachedAt: cached.cachedAt,
      });
      return cached.data as any[];
    }

    // Fetch from repository
    const data = await this.stockRepo.getAnalystEstimates(normalizedSymbol, period);

    // Cache the result
    setCache(cacheKey, data, ttl);

    return data;
  }

  /**
   * Get financial growth metrics for a stock
   * Caching: 24 hours (annual data)
   */
  async getFinancialGrowth(symbol: string): Promise<any[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0 || normalizedSymbol.length > 10) {
      throw new Error('Invalid symbol format');
    }

    const cacheKey = `stock:financial-growth:${normalizedSymbol}`;
    const ttl = 86400; // 24 hours

    // Check in-memory cache first
    const cached = getCacheIfValid(cacheKey, ttl);
    if (cached) {
      this.logger?.info('Cache hit for financial growth', {
        symbol: normalizedSymbol,
        cachedAt: cached.cachedAt,
      });
      return cached.data as any[];
    }

    // Fetch from repository
    const data = await this.stockRepo.getFinancialGrowth(normalizedSymbol);

    // Cache the result
    setCache(cacheKey, data, ttl);

    return data;
  }

  /**
   * Get DCF valuation for a stock
   * Caching: 24 hours
   */
  async getDCF(symbol: string): Promise<any> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0 || normalizedSymbol.length > 10) {
      throw new Error('Invalid symbol format');
    }

    const cacheKey = `stock:dcf:${normalizedSymbol}`;
    const ttl = 86400; // 24 hours

    // Check in-memory cache first
    const cached = getCacheIfValid(cacheKey, ttl);
    if (cached) {
      this.logger?.info('Cache hit for DCF', {
        symbol: normalizedSymbol,
        cachedAt: cached.cachedAt,
      });
      return cached.data;
    }

    // Fetch from repository
    const data = await this.stockRepo.getDCF(normalizedSymbol);

    // Cache the result
    setCache(cacheKey, data, ttl);

    return data;
  }

  /**
   * Get financial scores for a stock
   * Caching: 24 hours
   */
  async getFinancialScores(symbol: string): Promise<any> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0 || normalizedSymbol.length > 10) {
      throw new Error('Invalid symbol format');
    }

    const cacheKey = `stock:financial-scores:${normalizedSymbol}`;
    const ttl = 86400; // 24 hours

    // Check in-memory cache first
    const cached = getCacheIfValid(cacheKey, ttl);
    if (cached) {
      this.logger?.info('Cache hit for financial scores', {
        symbol: normalizedSymbol,
        cachedAt: cached.cachedAt,
      });
      return cached.data;
    }

    // Fetch from repository
    const data = await this.stockRepo.getFinancialScores(normalizedSymbol);

    // Cache the result
    setCache(cacheKey, data, ttl);

    return data;
  }
}

