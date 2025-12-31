import type { CommonStock } from '@stockly/shared/types';

export interface ICommonStocksRepository {
  /**
   * Get all active stocks from the common stocks list
   */
  getAllActiveStocks(): Promise<CommonStock[]>;
  
  /**
   * Get all stocks (including inactive)
   */
  getAllStocks(): Promise<CommonStock[]>;
  
  /**
   * Get a single stock by symbol
   */
  getStockBySymbol(symbol: string): Promise<CommonStock | null>;
  
  /**
   * Update stock information
   */
  updateStock(symbol: string, data: { name?: string; exchange?: string; isActive?: boolean }): Promise<CommonStock>;
  
  /**
   * Add a new stock to the list
   */
  addStock(symbol: string, data: { name?: string; exchange?: string }): Promise<CommonStock>;
  
  /**
   * Remove a stock (soft delete - sets isActive = false)
   */
  removeStock(symbol: string): Promise<boolean>;
  
  /**
   * Add multiple stocks at once
   */
  bulkAddStocks(stocks: Array<{ symbol: string; name?: string; exchange?: string }>): Promise<{ added: number; skipped: number; errors: string[] }>;
  
  /**
   * Get total count of active stocks
   */
  getStocksCount(activeOnly?: boolean): Promise<number>;
}

