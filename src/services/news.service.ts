/**
 * News Service
 * Contains business logic for news operations
 */

import type { INewsRepository, NewsOptions } from '../repositories/interfaces/INewsRepository';
import type { NewsItem, NewsPagination } from '@stockly/shared/types';

export class NewsService {
  constructor(private newsRepo: INewsRepository) {}

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
   * Get general market news
   */
  async getGeneralNews(options?: NewsOptions): Promise<{
    news: NewsItem[];
    pagination: NewsPagination;
  }> {
    return this.newsRepo.getGeneralNews(options);
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

