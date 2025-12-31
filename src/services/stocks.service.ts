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
import { getStaleCacheEntry } from '../api/cache';

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
}

