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

  /**
   * Get key executives for a stock
   */
  getKeyExecutives(symbol: string): Promise<any[]>;

  /**
   * Get analyst estimates for a stock
   */
  getAnalystEstimates(symbol: string, period?: 'annual' | 'quarter'): Promise<any[]>;

  /**
   * Get financial growth metrics for a stock
   */
  getFinancialGrowth(symbol: string): Promise<any[]>;

  /**
   * Get DCF valuation for a stock
   */
  getDCF(symbol: string): Promise<any>;

  /**
   * Get financial scores for a stock
   */
  getFinancialScores(symbol: string): Promise<any>;
}

