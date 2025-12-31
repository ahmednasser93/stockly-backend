/**
 * Stock Repository Implementation
 * Fetches stock data from external APIs (FMP) and manages caching
 * Note: Stock data is not stored in D1, only cached in KV
 */

import type { IStockRepository } from '../interfaces/IStockRepository';
import type { StockDetails, StockProfile, StockQuote, StockChart, StockFinancials, StockNews, StockPeer, ChartDataPoint } from '@stockly/shared/types';
import { getCacheIfValid, setCache } from '../../api/cache';
import { getConfig } from '../../api/config';
import { API_URL, API_KEY } from '../../util';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';

export class StockRepository implements IStockRepository {
  constructor(
    private env: Env,
    private logger?: Logger
  ) {}

  /**
   * Get cached stock details if valid
   */
  private async getCachedStockDetails(symbol: string): Promise<StockDetails | null> {
    const config = await getConfig(this.env);
    const pollingIntervalSec = config.pollingIntervalSec;
    const cacheKey = `stock-details:${symbol}`;

    const cached = getCacheIfValid(cacheKey, pollingIntervalSec);
    if (cached) {
      return { ...cached.data, cached: true };
    }

    return null;
  }

  /**
   * Cache stock details
   */
  private async setCachedStockDetails(
    symbol: string,
    data: StockDetails,
    pollingIntervalSec: number
  ): Promise<void> {
    const cacheKey = `stock-details:${symbol}`;
    setCache(cacheKey, data, pollingIntervalSec + 5); // TTL slightly longer than polling interval
  }

  /**
   * Fetch from FMP API with retry logic for rate limits and timeouts
   */
  private async fetchWithRetry(url: string, maxRetries: number = 3): Promise<any> {
    for (let i = 0; i < maxRetries; i++) {
      try {
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

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        
        // Check for FMP API error messages
        if (data && typeof data === "object") {
          if ("Error Message" in data || "error" in data) {
            throw new Error("FMP API error response");
          }
        }

        return data;
      } catch (error: any) {
        // If it's a timeout or abort, retry
        if (error.name === "AbortError" || error.name === "TimeoutError") {
          if (i === maxRetries - 1) throw error;
          const delay = Math.pow(2, i) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // If last retry, throw the error
        if (i === maxRetries - 1) throw error;

        // Retry with exponential backoff
        const delay = Math.pow(2, i) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error("Max retries exceeded");
  }

  /**
   * Fetch profile data from FMP
   */
  private async fetchProfile(symbol: string): Promise<any> {
    // Try multiple profile endpoints (same pattern as get-stock.ts)
    const endpoints = [
      `${API_URL}/profile?symbol=${symbol}&apikey=${API_KEY}`,
      `${API_URL}/profile/${symbol}?apikey=${API_KEY}`,
      `${API_URL}/company/profile/${symbol}?apikey=${API_KEY}`,
    ];

    for (const url of endpoints) {
      try {
        const data = await this.fetchWithRetry(url);
        const profile = Array.isArray(data) && data.length > 0 ? data[0] : data;
        if (profile && (profile.symbol || profile.Symbol)) {
          return profile;
        }
      } catch (error) {
        // Try next endpoint
        continue;
      }
    }
    throw new Error("All profile endpoints failed");
  }

  /**
   * Fetch quote data from FMP
   */
  private async fetchQuote(symbol: string): Promise<any> {
    const url = `${API_URL}/quote?symbol=${symbol}&apikey=${API_KEY}`;
    return this.fetchWithRetry(url);
  }

  /**
   * Fetch historical price data from FMP
   */
  private async fetchHistorical(symbol: string): Promise<any> {
    const url = `${API_URL}/historical-price-full/${symbol}?serietype=line&timeseries=365&apikey=${API_KEY}`;
    return this.fetchWithRetry(url);
  }

  /**
   * Fetch key metrics from FMP
   */
  private async fetchKeyMetrics(symbol: string): Promise<any> {
    const url = `${API_URL}/key-metrics/${symbol}?limit=4&apikey=${API_KEY}`;
    return this.fetchWithRetry(url);
  }

  /**
   * Fetch income statement from FMP
   */
  private async fetchIncomeStatement(symbol: string): Promise<any> {
    const url = `${API_URL}/income-statement/${symbol}?limit=4&apikey=${API_KEY}`;
    return this.fetchWithRetry(url);
  }

  /**
   * Fetch stock news from FMP
   */
  private async fetchNews(symbol: string): Promise<any> {
    const url = `${API_URL}/stock_news?tickers=${symbol}&limit=6&apikey=${API_KEY}`;
    return this.fetchWithRetry(url);
  }

  /**
   * Fetch financial ratios from FMP
   */
  private async fetchRatios(symbol: string): Promise<any> {
    const url = `${API_URL}/ratios/${symbol}?limit=3&apikey=${API_KEY}`;
    return this.fetchWithRetry(url);
  }

  /**
   * Normalize profile data from FMP response
   */
  private normalizeProfile(rawProfile: any, symbol: string): StockProfile {
    const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;

    // Extract beta, handling various possible field names and types
    let beta: number | undefined = undefined;
    if (profile?.beta !== undefined && profile?.beta !== null) {
      beta = typeof profile.beta === 'number' ? profile.beta : parseFloat(profile.beta);
      if (isNaN(beta)) beta = undefined;
    }

    return {
      companyName: profile?.companyName || profile?.name || "",
      industry: profile?.industry || "",
      sector: profile?.sector || "",
      description:
        profile?.description ||
        profile?.longDescription ||
        profile?.descriptionText ||
        "",
      website: profile?.website || "",
      image:
        profile?.image ||
        `https://images.financialmodelingprep.com/symbol/${symbol}.png`,
      beta,
    };
  }

  /**
   * Normalize quote data from FMP response
   */
  private normalizeQuote(rawQuote: any): StockQuote {
    const quote = Array.isArray(rawQuote) ? rawQuote[0] : rawQuote;

    return {
      price: quote?.price || 0,
      change: quote?.change || 0,
      changesPercentage:
        quote?.changesPercentage ||
        quote?.changePercent ||
        quote?.changePercentage ||
        0,
      dayHigh: quote?.dayHigh || 0,
      dayLow: quote?.dayLow || 0,
      open: quote?.open || 0,
      previousClose: quote?.previousClose || 0,
      volume: quote?.volume || 0,
      marketCap: quote?.marketCap || 0,
    };
  }

  /**
   * Normalize historical data into chart time periods
   */
  private normalizeChartData(historicalData: any): StockChart {
    const historical = historicalData?.historical || [];
    if (!Array.isArray(historical) || historical.length === 0) {
      return {
        "1D": [],
        "1W": [],
        "1M": [],
        "3M": [],
        "1Y": [],
        "ALL": [],
      };
    }

    // Sort by date ascending
    const sorted = [...historical].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    const filterByDate = (startDate: Date): ChartDataPoint[] =>
      sorted
        .filter((item) => new Date(item.date) >= startDate)
        .map((item) => ({
          date: item.date,
          price: item.close || item.price || 0,
          volume: item.volume,
        }));

    return {
      "1D": filterByDate(oneDayAgo),
      "1W": filterByDate(oneWeekAgo),
      "1M": filterByDate(oneMonthAgo),
      "3M": filterByDate(threeMonthsAgo),
      "1Y": filterByDate(oneYearAgo),
      "ALL": sorted.map((item) => ({
        date: item.date,
        price: item.close || item.price || 0,
        volume: item.volume,
      })),
    };
  }

  /**
   * Normalize financial data from FMP responses
   */
  private normalizeFinancials(
    incomeData: any,
    keyMetricsData: any,
    ratiosData: any
  ): StockFinancials {
    const income = Array.isArray(incomeData)
      ? incomeData
      : incomeData
      ? [incomeData]
      : [];
    const metrics = Array.isArray(keyMetricsData)
      ? keyMetricsData
      : keyMetricsData
      ? [keyMetricsData]
      : [];
    const ratios = Array.isArray(ratiosData)
      ? ratiosData
      : ratiosData
      ? [ratiosData]
      : [];

    return {
      income: income.slice(0, 4).map((item: any) => ({
        date: item.date || item.calendarYear || "",
        revenue: item.revenue,
        netIncome: item.netIncome,
        eps: item.eps,
        ...item, // Include all other fields
      })),
      keyMetrics: metrics.slice(0, 4).map((item: any) => ({
        date: item.date || item.calendarYear || "",
        peRatio: item.peRatio,
        priceToBook: item.priceToBookRatio,
        ...item,
      })),
      ratios: ratios.slice(0, 3).map((item: any) => ({
        date: item.date || item.calendarYear || "",
        currentRatio: item.currentRatio,
        debtToEquity: item.debtToEquity,
        ...item,
      })),
    };
  }

  /**
   * Normalize news data from FMP response
   */
  private normalizeNews(newsData: any): StockNews[] {
    const news = Array.isArray(newsData)
      ? newsData
      : newsData
      ? [newsData]
      : [];

    return news.slice(0, 6).map((item: any) => ({
      title: item.title || "",
      text: item.text || item.description || "",
      url: item.url || "",
      publishedDate: item.publishedDate || item.date || "",
      image: item.image,
    }));
  }

  /**
   * Normalize peers data (optional, can be empty array if endpoint fails)
   */
  private normalizePeers(peersData: any): StockPeer[] {
    const peers = Array.isArray(peersData)
      ? peersData
      : peersData
      ? [peersData]
      : [];

    return peers.slice(0, 10).map((item: any) => ({
      symbol: item.symbol || "",
      name: item.name || "",
      price: item.price,
    }));
  }

  async getStockDetails(symbol: string): Promise<StockDetails> {
    const normalizedSymbol = symbol.toUpperCase();
    
    try {
      // Check cache first
      const cached = await this.getCachedStockDetails(normalizedSymbol);
      if (cached) {
        this.logger?.info(`Cache hit for stock details: ${normalizedSymbol}`);
        return cached;
      }

      this.logger?.info(`Cache miss for stock details: ${normalizedSymbol}, fetching...`);

      // Get config for polling interval
      const config = await getConfig(this.env);
      const pollingIntervalSec = config.pollingIntervalSec;

      // Fetch all data in parallel with Promise.allSettled
      // This allows partial success - if some endpoints fail, we still return available data
      const [
        profileResult,
        quoteResult,
        historicalResult,
        keyMetricsResult,
        incomeResult,
        newsResult,
        ratiosResult,
      ] = await Promise.allSettled([
        this.fetchProfile(normalizedSymbol),
        this.fetchQuote(normalizedSymbol),
        this.fetchHistorical(normalizedSymbol),
        this.fetchKeyMetrics(normalizedSymbol),
        this.fetchIncomeStatement(normalizedSymbol),
        this.fetchNews(normalizedSymbol),
        this.fetchRatios(normalizedSymbol),
      ]);

      // Check for errors and track partial data
      let partial = false;

      // Normalize profile (required - but provide defaults if fails)
      let profile: StockProfile;
      if (profileResult.status === "fulfilled") {
        profile = this.normalizeProfile(profileResult.value, normalizedSymbol);
      } else {
        this.logger?.warn(
          `Failed to fetch profile for ${normalizedSymbol}:`,
          profileResult.reason
        );
        partial = true;
        profile = {
          companyName: "",
          industry: "",
          sector: "",
          description: "",
          website: "",
          image: `https://images.financialmodelingprep.com/symbol/${normalizedSymbol}.png`,
          beta: undefined,
        };
      }

      // Normalize quote (required - but provide defaults if fails)
      let quote: StockQuote;
      if (quoteResult.status === "fulfilled") {
        quote = this.normalizeQuote(quoteResult.value);
      } else {
        this.logger?.warn(
          `Failed to fetch quote for ${normalizedSymbol}:`,
          quoteResult.reason
        );
        partial = true;
        quote = {
          price: 0,
          change: 0,
          changesPercentage: 0,
          dayHigh: 0,
          dayLow: 0,
          open: 0,
          previousClose: 0,
          volume: 0,
          marketCap: 0,
        };
      }

      // Normalize chart (optional - empty arrays if fails)
      let chart: StockChart;
      if (historicalResult.status === "fulfilled") {
        chart = this.normalizeChartData(historicalResult.value);
      } else {
        this.logger?.warn(
          `Failed to fetch historical for ${normalizedSymbol}:`,
          historicalResult.reason
        );
        partial = true;
        chart = {
          "1D": [],
          "1W": [],
          "1M": [],
          "3M": [],
          "1Y": [],
          "ALL": [],
        };
      }

      // Normalize financials (optional)
      const financials = this.normalizeFinancials(
        incomeResult.status === "fulfilled" ? incomeResult.value : null,
        keyMetricsResult.status === "fulfilled" ? keyMetricsResult.value : null,
        ratiosResult.status === "fulfilled" ? ratiosResult.value : null
      );

      if (
        incomeResult.status === "rejected" ||
        keyMetricsResult.status === "rejected" ||
        ratiosResult.status === "rejected"
      ) {
        partial = true;
      }

      // Normalize news (optional)
      let news: StockNews[];
      if (newsResult.status === "fulfilled") {
        news = this.normalizeNews(newsResult.value);
      } else {
        this.logger?.warn(
          `Failed to fetch news for ${normalizedSymbol}:`,
          newsResult.reason
        );
        partial = true;
        news = [];
      }

      // Peers are optional - always empty array for now
      // (stock-screener endpoint is too expensive/large)
      const peers: StockPeer[] = [];

      // Build final response
      const stockDetails: StockDetails = {
        symbol: normalizedSymbol,
        profile,
        quote,
        chart,
        financials,
        news,
        peers,
        partial,
        refreshedAt: Date.now(),
      };

      // Cache the result
      await this.setCachedStockDetails(normalizedSymbol, stockDetails, pollingIntervalSec);

      return stockDetails;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch stock details';
      this.logger?.error(`Error fetching stock details for ${normalizedSymbol}:`, error);
      throw new Error(errorMessage);
    }
  }

  async watchStockDetails(symbol: string): Promise<AsyncIterable<StockDetails>> {
    // Return an async iterable that periodically fetches stock details
    const normalizedSymbol = symbol.toUpperCase();
    const updateInterval = 30000; // 30 seconds
    const repository = this; // Capture 'this' for use in generator

    return {
      async *[Symbol.asyncIterator]() {
        while (true) {
          try {
            const details = await repository.getStockDetails(normalizedSymbol);
            yield details;
            await new Promise(resolve => setTimeout(resolve, updateInterval));
          } catch (error) {
            // On error, wait and retry
            await new Promise(resolve => setTimeout(resolve, updateInterval));
          }
        }
      },
    };
  }
}
