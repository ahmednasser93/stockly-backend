import type { IQuotesRepository } from '../repositories/interfaces/IQuotesRepository';
import type { Quote } from '@stockly/shared/types';
import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { getConfig } from '../api/config';
import { isWithinWorkingHours } from '../utils/working-hours';
import { getStaleCacheEntry } from '../api/cache';

export class QuotesService {
  constructor(
    private quotesRepo: IQuotesRepository,
    private env?: Env,
    private logger?: Logger
  ) {}

  async getQuote(symbol: string): Promise<Quote> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      throw new Error('Invalid symbol format');
    }

    // Check working hours
    let outsideHours = false;
    if (this.env) {
      const config = await getConfig(this.env);
      outsideHours = !isWithinWorkingHours(config);

      // Outside working hours - try to get stale cache
      if (outsideHours) {
        const cacheKey = `quote:${normalizedSymbol}`;
        const staleCache = getStaleCacheEntry(cacheKey);
        if (staleCache && staleCache.data) {
          this.logger?.info('Outside working hours, returning stale cache for quote', {
            symbol: normalizedSymbol,
            cachedAt: staleCache.cachedAt,
          });
          return staleCache.data as Quote;
        }
        // No stale cache available
        this.logger?.warn('Outside working hours and no cache available for quote', {
          symbol: normalizedSymbol,
        });
        throw new Error('Quote unavailable outside working hours - no cached data available');
      }
    }

    return this.quotesRepo.getQuote(normalizedSymbol);
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const normalizedSymbols = symbols
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    if (normalizedSymbols.length === 0) {
      throw new Error('Invalid symbols format');
    }

    // Remove duplicates
    const uniqueSymbols = Array.from(new Set(normalizedSymbols));

    // Check working hours
    let outsideHours = false;
    if (this.env) {
      const config = await getConfig(this.env);
      outsideHours = !isWithinWorkingHours(config);

      // Outside working hours - try to get stale cache for all symbols
      if (outsideHours) {
        const staleQuotes: Quote[] = [];
        for (const symbol of uniqueSymbols) {
          const cacheKey = `quote:${symbol}`;
          const staleCache = getStaleCacheEntry(cacheKey);
          if (staleCache && staleCache.data) {
            staleQuotes.push(staleCache.data as Quote);
          }
        }
        if (staleQuotes.length > 0) {
          this.logger?.info('Outside working hours, returning stale cache for quotes', {
            count: staleQuotes.length,
            total: uniqueSymbols.length,
          });
          return staleQuotes;
        }
        // No stale cache available
        this.logger?.warn('Outside working hours and no cache available for quotes');
        return []; // Return empty array instead of throwing
      }
    }

    return this.quotesRepo.getQuotes(uniqueSymbols);
  }
}

