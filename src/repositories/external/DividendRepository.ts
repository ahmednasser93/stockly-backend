/**
 * Dividend Repository Implementation
 * Fetches dividend data from FMP API
 */

import { API_URL, API_KEY } from '../../util';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';

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
    private logger?: Logger
  ) {}

  /**
   * Fetch from FMP API with retry logic for rate limits and timeouts
   */
  private async fetchWithRetry(url: string, maxRetries: number = 3): Promise<any> {
    const apiKey = this.env.FMP_API_KEY ?? API_KEY;
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        this.logger?.info(`Fetching from FMP API (attempt ${i + 1}/${maxRetries}): ${url.replace(apiKey, '***')}`);
        
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
          },
          // 30 second timeout
          signal: AbortSignal.timeout(30000),
        });

        if (res.status === 429) {
          // Rate limited - wait and retry with exponential backoff
          const delay = Math.pow(2, i) * 1000;
          this.logger?.warn(`Rate limited, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Handle 404 as "no data available" (valid response)
        if (res.status === 404) {
          this.logger?.info('FMP API returned 404 (no data available)');
          return null;
        }

        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${errorText.substring(0, 200)}`);
        }

        const data = await res.json();
        
        // Check for FMP API error messages
        if (data && typeof data === "object") {
          if ("Error Message" in data) {
            throw new Error(`FMP API error: ${data["Error Message"]}`);
          }
          if ("error" in data && typeof data.error === "string") {
            throw new Error(`FMP API error: ${data.error}`);
          }
        }

        return data;
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || String(error);
        this.logger?.warn(`FMP API fetch attempt ${i + 1} failed: ${errorMessage}`);
        
        // If it's a timeout or abort, retry
        if (error.name === "AbortError" || error.name === "TimeoutError") {
          if (i === maxRetries - 1) {
            throw new Error(`Request timeout after ${maxRetries} attempts: ${errorMessage}`);
          }
          const delay = Math.pow(2, i) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // If last retry, throw the error with more context
        if (i === maxRetries - 1) {
          throw new Error(`FMP API failed after ${maxRetries} attempts: ${errorMessage}`);
        }

        // Retry with exponential backoff
        const delay = Math.pow(2, i) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    
    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Fetch historical dividend data from FMP API
   * GET /v3/historical-price-full/stock_dividend/{symbol}
   */
  async getHistoricalDividends(symbol: string): Promise<DividendHistory[]> {
    const apiKey = this.env.FMP_API_KEY ?? API_KEY;
    const normalizedSymbol = symbol.trim().toUpperCase();
    
    const url = `${API_URL}/v3/historical-price-full/stock_dividend/${normalizedSymbol}?apikey=${apiKey}`;
    
    try {
      const data = await this.fetchWithRetry(url);
      
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
   * Fetch current dividend yield from FMP profile endpoint
   * GET /v3/profile/{symbol}
   * Extracts yield from dividendYield field, or calculates from lastDiv and price
   */
  async getCurrentYield(symbol: string): Promise<number | null> {
    const apiKey = this.env.FMP_API_KEY ?? API_KEY;
    const normalizedSymbol = symbol.trim().toUpperCase();
    
    const url = `${API_URL}/v3/profile/${normalizedSymbol}?apikey=${apiKey}`;
    
    try {
      const data = await this.fetchWithRetry(url);
      
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

