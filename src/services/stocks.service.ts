/**
 * Stock Service
 * Contains business logic for stock operations
 */

import type { IStockRepository } from '../repositories/interfaces/IStockRepository';
import type { StockDetails } from '@stockly/shared/types';

export class StockService {
  constructor(private stockRepo: IStockRepository) {}

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

    return this.stockRepo.watchStockDetails(normalizedSymbol);
  }
}

