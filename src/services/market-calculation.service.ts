import type { MarketStockItem } from '@stockly/shared/types';

/**
 * Market Calculation Service
 * Calculates rankings (gainers, losers, actives) from stock lists
 */
export class MarketCalculationService {
  /**
   * Calculate top gainers from stock list
   * Only includes stocks with positive changesPercentage (increases)
   * Sorts by changesPercentage descending (highest gain first)
   */
  calculateGainers(stocks: MarketStockItem[]): MarketStockItem[] {
    return stocks
      .filter((stock) => stock.changesPercentage !== null && stock.changesPercentage !== undefined && stock.changesPercentage > 0)
      .sort((a, b) => (b.changesPercentage ?? 0) - (a.changesPercentage ?? 0));
  }

  /**
   * Calculate top losers from stock list
   * Only includes stocks with negative changesPercentage (decreases)
   * Sorts by changesPercentage ascending (most negative first)
   */
  calculateLosers(stocks: MarketStockItem[]): MarketStockItem[] {
    return stocks
      .filter((stock) => stock.changesPercentage !== null && stock.changesPercentage !== undefined && stock.changesPercentage < 0)
      .sort((a, b) => (a.changesPercentage ?? 0) - (b.changesPercentage ?? 0));
  }

  /**
   * Calculate most active stocks from stock list
   * Sorts by volume descending (highest volume first)
   */
  calculateActives(stocks: MarketStockItem[]): MarketStockItem[] {
    return stocks
      .filter((stock) => stock.volume !== null && stock.volume !== undefined && stock.volume > 0)
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  }
}

