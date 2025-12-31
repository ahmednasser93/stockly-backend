/**
 * Market Repository Implementation
 * Fetches market data (gainers, losers, actives) from FMP's dedicated endpoints
 */

import type { MarketStockItem, SectorPerformanceItem } from '@stockly/shared/types';
import { API_URL, API_KEY } from '../../util';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';

// Note: We use FMP's dedicated endpoints for gainers/losers/actives
// No need for a predefined stock list

export class MarketRepository {
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
          this.logger?.info('FMP API returned 404 (no data available), returning empty array');
          return [];
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

        // Empty array is valid (market might be closed)
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
   * Fetch prices/quotes for multiple stocks from FMP API (public method)
   * Optimized: Uses FMP's batch quote endpoint with comma-separated symbols
   * Falls back to individual requests if batch fails or returns empty
   */
  async fetchPricesForStocks(symbols: string[]): Promise<MarketStockItem[]> {
    return this.fetchQuotesForStocks(symbols);
  }

  /**
   * Fetch quotes for multiple stocks from FMP API (internal method)
   * Optimized: Uses FMP's batch quote endpoint with comma-separated symbols
   * Falls back to individual requests if batch fails or returns empty
   */
  private async fetchQuotesForStocks(symbols: string[]): Promise<MarketStockItem[]> {
    if (symbols.length === 0) return [];
    
    const apiKey = this.env.FMP_API_KEY ?? API_KEY;
    
    // FMP supports batch quotes with comma-separated symbols (up to ~50 per request)
    // Split into batches of 50 to avoid URL length limits
    const BATCH_SIZE = 50;
    const allQuotes: MarketStockItem[] = [];
    
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      
      try {
        // Try batch endpoint first (more efficient)
        const batchQuotes = await this.fetchBatchQuotes(batch, apiKey);
        
        // If batch returns empty but we know market is open, fallback to individual
        if (batchQuotes.length === 0 && batch.length > 0) {
          this.logger?.warn(`Batch quote returned empty, falling back to individual requests for batch starting at index ${i}`);
          const individualQuotes = await this.fetchQuotesIndividually(batch, apiKey);
          allQuotes.push(...individualQuotes);
        } else {
          allQuotes.push(...batchQuotes);
        }
      } catch (error) {
        // Fallback to individual requests if batch fails
        this.logger?.warn(`Batch quote failed, falling back to individual requests for batch starting at index ${i}`, { error: error instanceof Error ? error.message : String(error) });
        const individualQuotes = await this.fetchQuotesIndividually(batch, apiKey);
        allQuotes.push(...individualQuotes);
      }
      
      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    return allQuotes;
  }
  
  /**
   * Fetch quotes using FMP's batch endpoint (comma-separated symbols)
   */
  private async fetchBatchQuotes(symbols: string[], apiKey: string): Promise<MarketStockItem[]> {
    const symbolsParam = symbols.join(',');
    const url = `${API_URL}/quote?symbol=${symbolsParam}&apikey=${apiKey}`;
    
    const data = await this.fetchWithRetry(url, 2);
    
    // FMP returns an array for batch requests
    const quotes = Array.isArray(data) ? data : [data];
    const results: MarketStockItem[] = [];
    
    for (const quote of quotes) {
      if (quote && quote.symbol) {
        results.push(this.normalizeMarketItem(quote));
      }
    }
    
    return results;
  }
  
  /**
   * Fallback: Fetch quotes individually if batch fails
   */
  private async fetchQuotesIndividually(symbols: string[], apiKey: string): Promise<MarketStockItem[]> {
    const CONCURRENT_LIMIT = 10;
    const allQuotes: MarketStockItem[] = [];
    
    for (let i = 0; i < symbols.length; i += CONCURRENT_LIMIT) {
      const batch = symbols.slice(i, i + CONCURRENT_LIMIT);
      
      const quotePromises = batch.map(symbol => 
        this.fetchSingleQuote(symbol, apiKey)
      );
      
      const results = await Promise.allSettled(quotePromises);
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          allQuotes.push(result.value);
        }
      }
      
      // Small delay between batches
      if (i + CONCURRENT_LIMIT < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    return allQuotes;
  }
  
  /**
   * Fetch a single stock quote from FMP API
   */
  private async fetchSingleQuote(symbol: string, apiKey: string): Promise<MarketStockItem | null> {
    try {
      const url = `${API_URL}/quote?symbol=${symbol}&apikey=${apiKey}`;
      const data = await this.fetchWithRetry(url, 1); // Single retry for faster batch operations
      
      const quote = Array.isArray(data) ? data[0] : data;
      if (!quote || !quote.symbol) {
        return null;
      }
      
      return this.normalizeMarketItem(quote);
    } catch (error) {
      // Silently fail individual quotes to not slow down the batch
      return null;
    }
  }

  /**
   * Normalize FMP quote response to MarketStockItem format
   */
  private normalizeMarketItem(rawItem: any): MarketStockItem {
    return {
      symbol: rawItem.symbol || rawItem.Symbol || '',
      name: rawItem.name || rawItem.Name || rawItem.companyName || '',
      price: rawItem.price ?? 0,
      change: rawItem.change ?? null,
      changesPercentage: rawItem.changesPercentage ?? rawItem.changePercent ?? rawItem.changePercentage ?? null,
      volume: rawItem.volume ?? null,
      dayLow: rawItem.dayLow ?? rawItem.day_low ?? null,
      dayHigh: rawItem.dayHigh ?? rawItem.day_high ?? null,
      marketCap: rawItem.marketCap ?? rawItem.market_cap ?? null,
      exchange: rawItem.exchange ?? null,
      exchangeShortName: rawItem.exchangeShortName ?? rawItem.exchange_short_name ?? null,
      type: rawItem.type ?? null,
    };
  }

  /**
   * Fetch top gainers from FMP's dedicated endpoint
   * Falls back to building from popular stocks if dedicated endpoint fails
   */
  async getGainers(): Promise<MarketStockItem[]> {
    const apiKey = this.env.FMP_API_KEY ?? API_KEY;
    
    // Try dedicated endpoint first
    const endpoints = [
      `${API_URL}/v3/stock_market/gainers?apikey=${apiKey}`,
      `https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${apiKey}`,
      `https://financialmodelingprep.com/api/v4/gainers?apikey=${apiKey}`,
    ];
    
    for (const url of endpoints) {
      try {
        this.logger?.info(`Trying gainers endpoint: ${url.replace(apiKey, '***')}`);
        const data = await this.fetchWithRetry(url, 1); // Single retry per endpoint
        const items = Array.isArray(data) ? data : [];
        
        // Check if we got an error message (legacy endpoint error)
        if (items.length === 0 && typeof data === 'object' && 'Error Message' in data) {
          this.logger?.warn('Legacy endpoint error, will try fallback method');
          break; // Try fallback
        }
        
        if (items.length > 0) {
          return items
            .map(item => this.normalizeMarketItem(item))
            .filter(item => item.symbol);
        }
      } catch (error) {
        this.logger?.warn(`Gainers endpoint failed: ${url.replace(apiKey, '***')}`, { error: error instanceof Error ? error.message : String(error) });
        continue;
      }
    }
    
    // Fallback: Build gainers from popular stocks
    this.logger?.info('Dedicated gainers endpoint unavailable, building from popular stocks');
    return await this.buildGainersFromPopularStocks(apiKey);
  }

  /**
   * Build gainers list by fetching quotes for popular stocks and sorting by change percentage
   */
  private async buildGainersFromPopularStocks(apiKey: string): Promise<MarketStockItem[]> {
    // Popular stock symbols (major indices and high-volume stocks)
    const popularSymbols = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'V', 'JNJ',
      'WMT', 'JPM', 'MA', 'PG', 'UNH', 'HD', 'DIS', 'BAC', 'ADBE', 'NFLX',
      'PYPL', 'CMCSA', 'XOM', 'VZ', 'CSCO', 'PFE', 'CVX', 'ABT', 'KO', 'AVGO',
      'COST', 'MRK', 'PEP', 'TMO', 'ACN', 'ABBV', 'TXN', 'NKE', 'MDT', 'HON',
      'QCOM', 'PM', 'LIN', 'RTX', 'LOW', 'AMGN', 'BMY', 'UPS', 'DE', 'SBUX'
    ];
    
    try {
      // Fetch quotes for all popular stocks
      const quotes = await this.fetchQuotesForStocks(popularSymbols);
      
      // Filter out invalid quotes and only include stocks with positive changes, then sort by change percentage (descending)
      const gainers = quotes
        .filter(item => item.changesPercentage !== null && item.changesPercentage !== undefined && item.changesPercentage > 0)
        .sort((a, b) => (b.changesPercentage ?? 0) - (a.changesPercentage ?? 0))
        .slice(0, 50); // Top 50 gainers
      
      this.logger?.info(`Built gainers list from ${quotes.length} popular stocks, found ${gainers.length} with positive changes`);
      return gainers;
    } catch (error) {
      this.logger?.error('Failed to build gainers from popular stocks', error);
      throw error;
    }
  }

  /**
   * Fetch top losers from FMP's dedicated endpoint
   * Falls back to building from popular stocks if dedicated endpoint fails
   */
  async getLosers(): Promise<MarketStockItem[]> {
    const apiKey = this.env.FMP_API_KEY ?? API_KEY;
    
    // Try dedicated endpoint first
    const endpoints = [
      `${API_URL}/v3/stock_market/losers?apikey=${apiKey}`,
      `https://financialmodelingprep.com/api/v3/stock_market/losers?apikey=${apiKey}`,
      `https://financialmodelingprep.com/api/v4/losers?apikey=${apiKey}`,
    ];
    
    for (const url of endpoints) {
      try {
        this.logger?.info(`Trying losers endpoint: ${url.replace(apiKey, '***')}`);
        const data = await this.fetchWithRetry(url, 1);
        const items = Array.isArray(data) ? data : [];
        
        if (items.length === 0 && typeof data === 'object' && 'Error Message' in data) {
          this.logger?.warn('Legacy endpoint error, will try fallback method');
          break;
        }
        
        if (items.length > 0) {
          return items
            .map(item => this.normalizeMarketItem(item))
            .filter(item => item.symbol);
        }
      } catch (error) {
        this.logger?.warn(`Losers endpoint failed: ${url.replace(apiKey, '***')}`, { error: error instanceof Error ? error.message : String(error) });
        continue;
      }
    }
    
    // Fallback: Build losers from popular stocks
    this.logger?.info('Dedicated losers endpoint unavailable, building from popular stocks');
    return await this.buildLosersFromPopularStocks(apiKey);
  }

  /**
   * Build losers list by fetching quotes for popular stocks and sorting by change percentage (ascending)
   */
  private async buildLosersFromPopularStocks(apiKey: string): Promise<MarketStockItem[]> {
    // Popular stock symbols (same as gainers)
    const popularSymbols = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'V', 'JNJ',
      'WMT', 'JPM', 'MA', 'PG', 'UNH', 'HD', 'DIS', 'BAC', 'ADBE', 'NFLX',
      'PYPL', 'CMCSA', 'XOM', 'VZ', 'CSCO', 'PFE', 'CVX', 'ABT', 'KO', 'AVGO',
      'COST', 'MRK', 'PEP', 'TMO', 'ACN', 'ABBV', 'TXN', 'NKE', 'MDT', 'HON',
      'QCOM', 'PM', 'LIN', 'RTX', 'LOW', 'AMGN', 'BMY', 'UPS', 'DE', 'SBUX'
    ];
    
    try {
      const quotes = await this.fetchQuotesForStocks(popularSymbols);
      
      // Filter and only include stocks with negative changes, then sort by change percentage (ascending - most negative first)
      const losers = quotes
        .filter(item => item.changesPercentage !== null && item.changesPercentage !== undefined && item.changesPercentage < 0)
        .sort((a, b) => (a.changesPercentage ?? 0) - (b.changesPercentage ?? 0))
        .slice(0, 50); // Top 50 losers
      
      this.logger?.info(`Built losers list from ${quotes.length} popular stocks, found ${losers.length} with negative changes`);
      return losers;
    } catch (error) {
      this.logger?.error('Failed to build losers from popular stocks', error);
      throw error;
    }
  }

  /**
   * Fetch most active stocks from FMP's dedicated endpoint
   * Falls back to building from popular stocks if dedicated endpoint fails
   */
  async getActives(): Promise<MarketStockItem[]> {
    const apiKey = this.env.FMP_API_KEY ?? API_KEY;
    
    // Try dedicated endpoint first
    const endpoints = [
      `${API_URL}/v3/stock_market/actives?apikey=${apiKey}`,
      `https://financialmodelingprep.com/api/v3/stock_market/actives?apikey=${apiKey}`,
      `https://financialmodelingprep.com/api/v4/actives?apikey=${apiKey}`,
    ];
    
    for (const url of endpoints) {
      try {
        this.logger?.info(`Trying actives endpoint: ${url.replace(apiKey, '***')}`);
        const data = await this.fetchWithRetry(url, 1);
        const items = Array.isArray(data) ? data : [];
        
        if (items.length === 0 && typeof data === 'object' && 'Error Message' in data) {
          this.logger?.warn('Legacy endpoint error, will try fallback method');
          break;
        }
        
        if (items.length > 0) {
          return items
            .map(item => this.normalizeMarketItem(item))
            .filter(item => item.symbol);
        }
      } catch (error) {
        this.logger?.warn(`Actives endpoint failed: ${url.replace(apiKey, '***')}`, { error: error instanceof Error ? error.message : String(error) });
        continue;
      }
    }
    
    // Fallback: Build actives from popular stocks
    this.logger?.info('Dedicated actives endpoint unavailable, building from popular stocks');
    return await this.buildActivesFromPopularStocks(apiKey);
  }

  /**
   * Build actives list by fetching quotes for popular stocks and sorting by volume
   */
  private async buildActivesFromPopularStocks(apiKey: string): Promise<MarketStockItem[]> {
    // Popular stock symbols (same as gainers/losers)
    const popularSymbols = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'V', 'JNJ',
      'WMT', 'JPM', 'MA', 'PG', 'UNH', 'HD', 'DIS', 'BAC', 'ADBE', 'NFLX',
      'PYPL', 'CMCSA', 'XOM', 'VZ', 'CSCO', 'PFE', 'CVX', 'ABT', 'KO', 'AVGO',
      'COST', 'MRK', 'PEP', 'TMO', 'ACN', 'ABBV', 'TXN', 'NKE', 'MDT', 'HON',
      'QCOM', 'PM', 'LIN', 'RTX', 'LOW', 'AMGN', 'BMY', 'UPS', 'DE', 'SBUX'
    ];
    
    try {
      const quotes = await this.fetchQuotesForStocks(popularSymbols);
      
      // Filter and sort by volume (descending - highest volume first)
      const actives = quotes
        .filter(item => item.volume !== null && item.volume !== undefined && item.volume > 0)
        .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
        .slice(0, 50); // Top 50 most active
      
      this.logger?.info(`Built actives list from ${quotes.length} popular stocks, found ${actives.length} with volume data`);
      return actives;
    } catch (error) {
      this.logger?.error('Failed to build actives from popular stocks', error);
      throw error;
    }
  }

  /**
   * Fetch stocks from screener with filters
   * @param marketCapMoreThan Minimum market cap in dollars (default: 1000000000)
   * @param peLowerThan Maximum P/E ratio (default: 20)
   * @param dividendMoreThan Minimum dividend yield percentage (default: 2)
   * @param limit Maximum number of results (default: 50, max: 50)
   */
  async getScreener(
    marketCapMoreThan: number = 1000000000,
    peLowerThan: number = 20,
    dividendMoreThan: number = 2,
    limit: number = 50
  ): Promise<MarketStockItem[]> {
    const apiKey = this.env.FMP_API_KEY ?? API_KEY;
    const url = `${API_URL}/v3/stock-screener?marketCapMoreThan=${marketCapMoreThan}&peLowerThan=${peLowerThan}&dividendMoreThan=${dividendMoreThan}&limit=${limit}&apikey=${apiKey}`;
    
    try {
      const data = await this.fetchWithRetry(url);
      const items = Array.isArray(data) ? data : [];
      // Limit results to the requested limit
      const limitedItems = items.slice(0, limit);
      return limitedItems.map(item => this.normalizeMarketItem(item));
    } catch (error) {
      this.logger?.error('Failed to fetch screener data from FMP API', error);
      throw error;
    }
  }

  /**
   * Normalize FMP sector performance response to SectorPerformanceItem format
   */
  private normalizeSectorItem(rawItem: any): SectorPerformanceItem {
    return {
      sector: rawItem.sector || rawItem.Sector || rawItem.name || '',
      changesPercentage: rawItem.changesPercentage ?? rawItem.changePercent ?? rawItem.changes ?? null,
    };
  }

  /**
   * Fetch sectors performance from FMP API
   */
  async getSectorsPerformance(): Promise<SectorPerformanceItem[]> {
    const apiKey = this.env.FMP_API_KEY ?? API_KEY;
    const url = `${API_URL}/v3/sectors-performance?apikey=${apiKey}`;
    
    try {
      const data = await this.fetchWithRetry(url);
      const items = Array.isArray(data) ? data : [];
      return items.map(item => this.normalizeSectorItem(item));
    } catch (error) {
      this.logger?.error('Failed to fetch sectors performance from FMP API', error);
      throw error;
    }
  }
}

