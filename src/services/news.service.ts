/**
 * News Service
 * Contains business logic for news operations with caching
 */

import type { INewsRepository, NewsOptions } from '../repositories/interfaces/INewsRepository';
import type { NewsItem, NewsPagination } from '@stockly/shared/types';
import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { getNewsDataFromKV, setNewsDataToKV, getStaleNewsDataFromKV } from '../api/news-cache';
import { getConfig } from '../api/config';
import { isWithinWorkingHours } from '../utils/working-hours';

export class NewsService {
  constructor(
    private newsRepo: INewsRepository,
    private env?: Env,
    private logger?: Logger
  ) {}

  /**
   * Get news for stock symbols
   * Business logic: Validate symbols, normalize, limit count
   */
  async getNews(symbols: string[], options?: NewsOptions): Promise<{
    news: NewsItem[];
    pagination: NewsPagination;
  }> {
    // Validate and normalize symbols
    const normalizedSymbols = symbols
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0 && s.length <= 10);

    if (normalizedSymbols.length === 0) {
      throw new Error('Invalid symbol format');
    }

    // Limit to prevent abuse (same as get-stocks)
    if (normalizedSymbols.length > 10) {
      throw new Error('Maximum 10 symbols allowed');
    }

    // Validate date range if both provided
    if (options?.from && options?.to && options.from > options.to) {
      throw new Error("'from' date must be before or equal to 'to' date");
    }

    return this.newsRepo.getNews(normalizedSymbols, options);
  }

  /**
   * Get cache TTL for news from config (with default)
   */
  private async getNewsCacheTTL(): Promise<number> {
    if (!this.env) {
      return 3600; // Default: 1 hour
    }
    const config = await getConfig(this.env);
    return config.marketCache?.newsTtlSec ?? 3600; // Default: 1 hour
  }

  /**
   * Get general market news with caching
   */
  async getGeneralNews(options?: NewsOptions): Promise<{
    news: NewsItem[];
    pagination: NewsPagination;
  }> {
    const cacheKey = 'news:general:latest';
    const kv = this.env?.alertsKv;
    const ttl = await this.getNewsCacheTTL();

    // Only cache first page (page 0 or undefined)
    const useCache = options?.page === undefined || options.page === 0;

    // Check working hours
    let outsideHours = false;
    if (this.env) {
      const config = await getConfig(this.env);
      outsideHours = !isWithinWorkingHours(config);
    }

    // Check KV cache first
    if (kv && useCache) {
      const cached = await getNewsDataFromKV(kv, cacheKey);
      if (cached) {
        this.logger?.info('Cache hit for general news', {
          cachedAt: cached.cachedAt,
        });
        return cached.data;
      }
    }

    // Outside working hours - return stale cache if available
    if (outsideHours && kv && useCache) {
      const stale = await getStaleNewsDataFromKV(kv, cacheKey);
      if (stale) {
        this.logger?.info('Outside working hours, returning stale cache for general news', {
          cachedAt: stale.cachedAt,
        });
        return stale.data;
      }
      // No stale cache available - return empty result
      this.logger?.warn('Outside working hours and no cache available for general news');
      return {
        news: [],
        pagination: { page: 0, limit: options?.limit || 20, total: 0, hasMore: false },
      };
    }

    // Cache miss or expired - fetch from repository (which calls FMP) (only during working hours)
    try {
      const result = await this.newsRepo.getGeneralNews(options);
      
      // Store in KV cache (non-blocking, only for first page)
      if (kv && useCache) {
        setNewsDataToKV(kv, cacheKey, result, ttl).catch(error => {
          this.logger?.warn('Failed to cache general news', error);
        });
      }
      
      return result;
    } catch (error) {
      // If FMP fails, try to return stale cache if available
      if (kv && useCache) {
        const stale = await getStaleNewsDataFromKV(kv, cacheKey);
        if (stale) {
          this.logger?.warn('FMP API failed, returning stale cache for general news');
          return stale.data;
        }
      }
      
      // No cache available, rethrow error
      throw error;
    }
  }

  /**
   * Get news for a single stock symbol
   */
  async getStockNews(symbol: string): Promise<{
    news: NewsItem[];
  }> {
    // Validate symbol format
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0 || normalizedSymbol.length > 10) {
      throw new Error('Invalid symbol format');
    }

    return this.newsRepo.getStockNews(normalizedSymbol);
  }
}

