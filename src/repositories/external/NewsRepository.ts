/**
 * News Repository Implementation
 * Fetches news data from external APIs (FMP) and manages caching
 * Note: News data is not stored in D1, only cached in KV
 */

import type { INewsRepository, NewsOptions } from '../interfaces/INewsRepository';
import type { NewsItem, NewsPagination } from '@stockly/shared/types';
import { API_URL, API_KEY } from '../../util';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';
import { getConfig } from '../../api/config';
import {
  getCachedNews,
  updateNewsInCache,
  generateCacheKey as generateNewsCacheKey,
  flushPendingWritesToKV,
} from '../../api/news-cache';

export class NewsRepository implements INewsRepository {
  constructor(
    private env: Env,
    private logger?: Logger
  ) {}

  /**
   * Normalize symbol
   */
  private normalizeSymbol(symbol: string): string {
    return symbol.trim().toUpperCase();
  }

  /**
   * Normalize news item from FMP API response
   */
  private normalizeNewsItem(item: any, symbol?: string): NewsItem {
    // Normalize symbol: use item.symbol first, then fallback to parameter, then null
    let normalizedSymbol: string | null = null;
    if (item.symbol) {
      normalizedSymbol = String(item.symbol).trim().toUpperCase();
    } else if (symbol) {
      normalizedSymbol = String(symbol).trim().toUpperCase();
    }

    return {
      title: item.title || item.headline || '',
      text: item.text || item.description || item.content || '',
      url: item.url || item.link || '',
      publishedDate: item.publishedDate || item.date || item.published_date || '',
      image: item.image || item.imageUrl || null,
      site: item.site || item.source || '',
      type: item.type || 'news',
      symbol: normalizedSymbol,
    };
  }

  /**
   * Fetch news from FMP API with pagination support
   */
  private async fetchNewsFromApi(
    symbols: string[],
    options?: NewsOptions
  ): Promise<any[]> {
    const symbolsParam = symbols.join(',');
    const params = new URLSearchParams({
      symbols: symbolsParam,
      apikey: API_KEY,
    });

    if (options?.from) {
      params.append('from', options.from);
    }
    if (options?.to) {
      params.append('to', options.to);
    }
    if (options?.page !== undefined) {
      params.append('page', options.page.toString());
    }
    if (options?.limit !== undefined) {
      params.append('limit', Math.min(options.limit, 250).toString());
    }

    const api = `${API_URL}/news/stock?${params.toString()}`;

    try {
      const res = await fetch(api, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`FMP API failed: HTTP ${res.status}`);
      }

      const data = await res.json();

      // Check for FMP API error messages
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        if ('Error Message' in data || 'error' in data) {
          throw new Error('FMP API error response');
        }
      }

      return Array.isArray(data) ? data : [];
    } catch (error) {
      this.logger?.error(`Failed to fetch news from FMP API for symbols ${symbolsParam}`, error);
      throw error;
    }
  }

  /**
   * Fetch general news from FMP API
   */
  private async fetchGeneralNewsFromApi(options?: NewsOptions): Promise<any[]> {
    const params = new URLSearchParams({
      apikey: API_KEY,
    });

    if (options?.page !== undefined) {
      params.append('page', options.page.toString());
    }
    if (options?.limit !== undefined) {
      params.append('limit', Math.min(options.limit, 250).toString());
    }

    const api = `${API_URL}/news/general-latest?${params.toString()}`;

    try {
      const res = await fetch(api, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`FMP API failed: HTTP ${res.status}`);
      }

      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      this.logger?.error('Failed to fetch general news from FMP API', error);
      throw error;
    }
  }

  async getNews(symbols: string[], options?: NewsOptions): Promise<{
    news: NewsItem[];
    pagination: NewsPagination;
  }> {
    const normalizedSymbols = symbols.map(s => this.normalizeSymbol(s));
    const config = await getConfig(this.env);
    const pollingIntervalSec = config.pollingIntervalSec;

    // Generate cache key
    const cacheKey = generateNewsCacheKey(normalizedSymbols, options);

    // Only cache if no pagination params (to avoid cache bloat)
    const useCache = !options?.from && !options?.to && options?.page === undefined && options?.limit === undefined;

    if (useCache) {
      const cachedEntry = await getCachedNews(this.env.alertsKv, cacheKey, pollingIntervalSec);

      if (cachedEntry) {
        const ageSeconds = Math.floor((Date.now() - cachedEntry.cachedAt) / 1000);
        this.logger?.info(`News cache hit for ${normalizedSymbols.join(',')}`, {
          ageSeconds,
          pollingIntervalSec,
          cacheStatus: 'HIT',
        });

        // Try to flush pending writes in background (non-blocking)
        if (this.env.alertsKv) {
          flushPendingWritesToKV(this.env.alertsKv, config.kvWriteIntervalSec).catch((err) => {
            this.logger?.warn('Failed to flush pending news cache writes', { error: err });
          });
        }

        return {
          news: cachedEntry.data.news || [],
          pagination: cachedEntry.data.pagination || {
            page: 0,
            limit: 20,
            total: (cachedEntry.data.news || []).length,
            hasMore: false,
          },
        };
      }
    }

    // Cache miss or expired - fetch from API
    this.logger?.info(`News cache miss for ${normalizedSymbols.join(',')}, fetching from API...`);

    // Check if provider failure simulation is enabled
    if (config.featureFlags.simulateProviderFailure) {
      return {
        news: [],
        pagination: {
          page: options?.page || 0,
          limit: options?.limit || 20,
          total: 0,
          hasMore: false,
        },
      };
    }

    // Fetch news from FMP API
    const newsData = await this.fetchNewsFromApi(normalizedSymbols, options);

    // Normalize news items
    const normalizedNews = newsData.map((item: any) => {
      let symbol = item.symbol;
      if (!symbol && normalizedSymbols.length === 1) {
        symbol = normalizedSymbols[0];
      } else if (!symbol && normalizedSymbols.length > 1) {
        const itemText = `${item.title || ''} ${item.text || ''}`.toUpperCase();
        symbol = normalizedSymbols.find(s => itemText.includes(s.toUpperCase())) || null;
      }
      return this.normalizeNewsItem(item, symbol);
    });

    // Build pagination metadata
    const pagination: NewsPagination = {
      page: options?.page !== undefined ? options.page : 0,
      limit: options?.limit !== undefined ? options.limit : 20,
      total: normalizedNews.length,
      hasMore: normalizedNews.length === (options?.limit || 20), // Assume has more if we got full page
    };

    // Cache the result (only if no pagination params)
    if (useCache) {
      updateNewsInCache(cacheKey, {
        symbols: normalizedSymbols,
        news: normalizedNews,
        pagination,
        cachedAt: Date.now(),
      });

      // Try to flush pending writes in background (non-blocking)
      if (this.env.alertsKv) {
        flushPendingWritesToKV(this.env.alertsKv, config.kvWriteIntervalSec).catch((err) => {
          this.logger?.warn('Failed to flush pending news cache writes', { error: err });
        });
      }
    }

    return {
      news: normalizedNews,
      pagination,
    };
  }

  async getGeneralNews(options?: NewsOptions): Promise<{
    news: NewsItem[];
    pagination: NewsPagination;
  }> {
    const config = await getConfig(this.env);
    const pollingIntervalSec = config.pollingIntervalSec;

    // Generate cache key for general news
    const cacheKey = generateNewsCacheKey(['general'], options);

    // Only cache first page
    const useCache = options?.page === undefined || options.page === 0;

    if (useCache) {
      const cachedEntry = await getCachedNews(this.env.alertsKv, cacheKey, pollingIntervalSec);

      if (cachedEntry) {
        const pageNum = options?.page ?? 0;
        const limitNum = options?.limit ?? 20;
        const cachedNews = cachedEntry.data.news || [];
        const pagination: NewsPagination = cachedEntry.data.pagination || {
          page: pageNum,
          limit: limitNum,
          total: cachedNews.length,
          hasMore: cachedNews.length >= limitNum,
        };

        this.logger?.info('General news cache hit', {
          ageSeconds: Math.floor((Date.now() - cachedEntry.cachedAt) / 1000),
          pollingIntervalSec,
          cacheStatus: 'HIT',
        });

        // Try to flush pending writes in background (non-blocking)
        if (this.env.alertsKv) {
          flushPendingWritesToKV(this.env.alertsKv, config.kvWriteIntervalSec).catch((err) => {
            this.logger?.warn('Failed to flush pending news cache writes', { error: err });
          });
        }

        return {
          news: cachedNews,
          pagination,
        };
      }
    }

    // Check if provider failure simulation is enabled
    if (config.featureFlags.simulateProviderFailure) {
      const pageNum = options?.page ?? 0;
      const limitNum = options?.limit ?? 20;
      return {
        news: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          hasMore: false,
        },
      };
    }

    // Fetch general news from FMP API
    const newsData = await this.fetchGeneralNewsFromApi(options);
    const normalizedNews = newsData.map((item: any) => this.normalizeNewsItem(item));

    // Build pagination metadata
    const pageNum = options?.page ?? 0;
    const limitNum = options?.limit ?? 20;
    const pagination: NewsPagination = {
      page: pageNum,
      limit: limitNum,
      total: normalizedNews.length,
      hasMore: normalizedNews.length >= limitNum,
    };

    // Cache the result (only first page)
    if (useCache) {
      updateNewsInCache(cacheKey, {
        symbols: ['general'],
        news: normalizedNews,
        pagination,
        cachedAt: Date.now(),
      });

      // Try to flush pending writes in background (non-blocking)
      if (this.env.alertsKv) {
        flushPendingWritesToKV(this.env.alertsKv, config.kvWriteIntervalSec).catch((err) => {
          this.logger?.warn('Failed to flush pending news cache writes', { error: err });
        });
      }
    }

    return {
      news: normalizedNews,
      pagination,
    };
  }

  async getStockNews(symbol: string): Promise<{
    news: NewsItem[];
  }> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    
    // Use getNews with single symbol and default options
    const result = await this.getNews([normalizedSymbol]);
    
    return {
      news: result.news,
    };
  }
}

