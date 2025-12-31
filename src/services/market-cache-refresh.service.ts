/**
 * Market Cache Refresh Service
 * Updates market cache when stock prices change (non-blocking side effect)
 */

import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { refreshMarketCacheIfNeeded } from '../api/market-cache';

export class MarketCacheRefreshService {
  constructor(
    private env: Env,
    private logger?: Logger
  ) {}

  /**
   * Refresh market cache when stock prices are updated
   * This is a non-blocking side effect - fire and forget
   * 
   * @param updatedStocks Array of stocks with updated prices
   */
  async refreshMarketCacheOnPriceUpdate(
    updatedStocks: Array<{
      symbol: string;
      price: number;
      change?: number | null;
      changePercent?: number | null;
      volume?: number | null;
    }>
  ): Promise<void> {
    if (!this.env.alertsKv) {
      this.logger?.warn('Market KV (alertsKv) is not configured; skipping cache refresh');
      return;
    }

    if (updatedStocks.length === 0) {
      return;
    }

    // This is fire-and-forget - we don't wait for completion
    refreshMarketCacheIfNeeded(this.env.alertsKv, updatedStocks)
      .then(() => {
        this.logger?.info(`Refreshed market cache with ${updatedStocks.length} updated stock prices`);
      })
      .catch((error) => {
        this.logger?.warn('Failed to refresh market cache', error);
        // Don't throw - this is a non-blocking side effect
      });
  }
}

