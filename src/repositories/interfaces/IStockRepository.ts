/**
 * Stock Repository Interface
 * Defines data access operations for stock data
 * Note: Stock data is primarily fetched from external APIs (FMP),
 * so this repository may cache data but doesn't store it in D1
 */

import type { StockDetails } from '@stockly/shared/types';

export interface IStockRepository {
  /**
   * Get stock details by symbol
   * Fetches from external API and may cache results
   */
  getStockDetails(symbol: string): Promise<StockDetails>;

  /**
   * Watch stock details for real-time updates (Stream-based)
   * Useful for mobile app to get periodic price updates
   */
  watchStockDetails(symbol: string): Promise<AsyncIterable<StockDetails>>;
}

