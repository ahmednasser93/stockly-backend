/**
 * News Repository Interface
 * Defines data access operations for news data
 * Note: News data is primarily fetched from external APIs (FMP),
 * so this repository may cache data but doesn't store it in D1
 */

import type { NewsItem, NewsPagination } from '@stockly/shared/types';

export interface NewsOptions {
  from?: string; // YYYY-MM-DD format
  to?: string; // YYYY-MM-DD format
  page?: number; // Page number (0-based)
  limit?: number; // Results per page (max 250, default 20)
}

export interface INewsRepository {
  /**
   * Get news for specific stock symbols
   * @param symbols Array of stock symbols
   * @param options Optional pagination and date range filters
   */
  getNews(symbols: string[], options?: NewsOptions): Promise<{
    news: NewsItem[];
    pagination: NewsPagination;
  }>;

  /**
   * Get general market news (not symbol-specific)
   * @param options Optional pagination
   */
  getGeneralNews(options?: NewsOptions): Promise<{
    news: NewsItem[];
    pagination: NewsPagination;
  }>;

  /**
   * Get news for a single stock symbol (simplified endpoint)
   * @param symbol Stock symbol
   */
  getStockNews(symbol: string): Promise<{
    news: NewsItem[];
  }>;
}

