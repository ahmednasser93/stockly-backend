/**
 * Dividend Repository Implementation
 * Fetches dividend data from FMP API
 */

import { API_KEY } from '../../util';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';
import type { DatalakeService } from '../../services/datalake.service';

export interface DividendHistory {
  date: string; // YYYY-MM-DD
  dividend: number; // Dividend amount per share
}

export interface ProfileData {
  lastDiv?: number; // Last dividend per share
  price?: number; // Current stock price
  dividendYield?: number; // Current dividend yield
}

export class DividendRepository {
  constructor(
    private env: Env,
    private logger?: Logger,
    private datalakeService?: DatalakeService
  ) {}

  /**
   * Get adapter for an endpoint, with fallback to direct FMP if datalake service not available
   */
  private async getAdapter(endpointId: string): Promise<import('../../infrastructure/datalake/DatalakeAdapter').DatalakeAdapter | null> {
    if (!this.datalakeService) return null;
    const envApiKey = this.env.FMP_API_KEY || API_KEY;
    return this.datalakeService.getAdapterForEndpoint(endpointId, envApiKey);
  }

  /**
   * Fetch historical dividend data using datalake adapter
   * GET /v3/historical-price-full/stock_dividend/{symbol}
   */
  async getHistoricalDividends(symbol: string): Promise<DividendHistory[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    
    try {
      const adapter = await this.getAdapter('historical-dividend');
      let data: any;

      if (adapter) {
        data = await adapter.fetch('/v3/historical-price-full/stock_dividend/{symbol}', { symbol: normalizedSymbol });
      } else {
        // Fallback to direct FMP
        const { API_URL, API_KEY } = await import('../../util');
        const apiKey = this.env.FMP_API_KEY ?? API_KEY;
        const res = await fetch(`${API_URL}/v3/historical-price-full/stock_dividend/${normalizedSymbol}?apikey=${apiKey}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        });
        if (res.status === 404) {
          this.logger?.info(`No historical dividend data found for ${normalizedSymbol}`);
          return [];
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      }
      
      // Handle empty or null response
      if (!data || !data.historical) {
        this.logger?.info(`No historical dividend data found for ${normalizedSymbol}`);
        return [];
      }

      const historical = Array.isArray(data.historical) ? data.historical : [];
      
      // Sort by date descending (newest first)
      const sorted = historical
        .filter((item: any) => item.date && item.dividend != null)
        .map((item: any) => ({
          date: item.date as string,
          dividend: typeof item.dividend === 'number' ? item.dividend : parseFloat(item.dividend) || 0,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      this.logger?.info(`Fetched ${sorted.length} historical dividend records for ${normalizedSymbol}`);
      return sorted;
    } catch (error) {
      this.logger?.error(`Failed to fetch historical dividends for ${normalizedSymbol}`, error);
      throw error;
    }
  }

  /**
   * Fetch current dividend yield using datalake adapter
   * GET /v3/profile/{symbol}
   * Extracts yield from dividendYield field, or calculates from lastDiv and price
   */
  async getCurrentYield(symbol: string): Promise<number | null> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    
    try {
      const adapter = await this.getAdapter('profile-v3');
      let data: any;

      if (adapter) {
        data = await adapter.fetch('/v3/profile/{symbol}', { symbol: normalizedSymbol });
      } else {
        // Fallback to direct FMP
        const { API_URL, API_KEY } = await import('../../util');
        const apiKey = this.env.FMP_API_KEY ?? API_KEY;
        const res = await fetch(`${API_URL}/v3/profile/${normalizedSymbol}?apikey=${apiKey}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        });
        if (res.status === 404) {
          this.logger?.info(`No profile data found for ${normalizedSymbol}`);
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      }
      
      // Handle empty or null response
      if (!data) {
        this.logger?.info(`No profile data found for ${normalizedSymbol}`);
        return null;
      }

      const profile = Array.isArray(data) ? data[0] : data;
      
      if (!profile) {
        return null;
      }

      // Try to get yield directly first
      if (profile.dividendYield != null && typeof profile.dividendYield === 'number' && profile.dividendYield > 0) {
        this.logger?.info(`Found dividend yield directly: ${profile.dividendYield}% for ${normalizedSymbol}`);
        return profile.dividendYield / 100; // Convert percentage to decimal
      }

      // Calculate yield from lastDiv and price
      const lastDiv = profile.lastDiv ?? profile.lastDividend;
      const price = profile.price ?? profile.currentPrice;

      if (lastDiv != null && price != null && price > 0) {
        const calculatedYield = (lastDiv / price) * 4; // Annualize quarterly dividend
        this.logger?.info(`Calculated dividend yield: ${calculatedYield * 100}% for ${normalizedSymbol} (lastDiv: ${lastDiv}, price: ${price})`);
        return calculatedYield;
      }

      this.logger?.info(`No dividend yield data available for ${normalizedSymbol}`);
      return null;
    } catch (error) {
      this.logger?.error(`Failed to fetch current yield for ${normalizedSymbol}`, error);
      return null;
    }
  }
}

