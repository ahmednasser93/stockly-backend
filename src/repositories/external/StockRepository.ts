/**
 * Stock Repository Implementation
 * Fetches stock data from external APIs via DatalakeAdapter and manages caching
 * Note: Stock data is not stored in D1, only cached in KV
 */

import type { IStockRepository } from '../interfaces/IStockRepository';
import type { StockDetails, StockProfile, StockQuote, StockChart, StockFinancials, StockNews, StockPeer, ChartDataPoint } from '@stockly/shared/types';
import { getCacheIfValid, setCache } from '../../api/cache';
import { getConfig } from '../../api/config';
import { API_KEY } from '../../util';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';
import type { DatalakeService } from '../../services/datalake.service';
import type { DatalakeAdapter } from '../../infrastructure/datalake/DatalakeAdapter';

export class StockRepository implements IStockRepository {
  constructor(
    private env: Env,
    private logger?: Logger,
    private datalakeService?: DatalakeService
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
    // Increased TTL from 35 seconds to 2 minutes to reduce KV writes
    // Stock prices 2 minutes old are acceptable for most use cases
    setCache(cacheKey, data, 120); // 2 minutes (was: pollingIntervalSec + 5 = 35 seconds)
  }

  /**
   * Get adapter for an endpoint, with fallback to direct FMP if datalake service not available
   */
  private async getAdapter(endpointId: string): Promise<DatalakeAdapter | null> {
    if (!this.datalakeService) {
      return null; // Fallback to direct FMP calls
    }
    const envApiKey = this.env.FMP_API_KEY || API_KEY;
    return this.datalakeService.getAdapterForEndpoint(endpointId, envApiKey);
  }

  /**
   * Fetch profile data using datalake adapter
   */
  private async fetchProfile(symbol: string): Promise<any> {
    const adapter = await this.getAdapter('profile');
    if (!adapter) {
      // Fallback to direct FMP (legacy behavior)
      const { API_URL, API_KEY } = await import('../../util');
      const endpoints = [
        `${API_URL}/profile?symbol=${symbol}&apikey=${API_KEY}`,
        `${API_URL}/profile/${symbol}?apikey=${API_KEY}`,
        `${API_URL}/company/profile/${symbol}?apikey=${API_KEY}`,
      ];
      for (const url of endpoints) {
        try {
          const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
          if (!res.ok) continue;
          const data = await res.json();
          const profile = Array.isArray(data) && data.length > 0 ? data[0] : data;
          if (profile && (profile.symbol || profile.Symbol)) return profile;
        } catch { continue; }
      }
      throw new Error("All profile endpoints failed");
    }

    // Try multiple profile endpoint paths
    const endpointPaths = ['/profile', '/profile/{symbol}', '/company/profile/{symbol}'];
    for (const path of endpointPaths) {
      try {
        const params: Record<string, string> = path.includes('{symbol}') 
          ? { symbol } 
          : { symbol };
        const data = await adapter.fetch(path, params);
        const profile = Array.isArray(data) && data.length > 0 ? data[0] : data;
        if (profile && (profile.symbol || profile.Symbol)) {
          return profile;
        }
      } catch (error) {
        this.logger?.warn(`Profile endpoint ${path} failed, trying next...`, error);
        continue;
      }
    }
    throw new Error("All profile endpoints failed");
  }

  /**
   * Fetch quote data using datalake adapter
   */
  private async fetchQuote(symbol: string): Promise<any> {
    const adapter = await this.getAdapter('quote');
    if (!adapter) {
      // Fallback to direct FMP
      const { API_URL, API_KEY } = await import('../../util');
      const res = await fetch(`${API_URL}/quote?symbol=${symbol}&apikey=${API_KEY}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    return adapter.fetch('/quote', { symbol });
  }

  /**
   * Fetch historical price data using datalake adapter
   */
  private async fetchHistorical(symbol: string): Promise<any> {
    const adapter = await this.getAdapter('historical-price-full');
    if (!adapter) {
      // Fallback to direct FMP
      const { API_URL, API_KEY } = await import('../../util');
      const res = await fetch(`${API_URL}/historical-price-full/${symbol}?serietype=line&timeseries=365&apikey=${API_KEY}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    return adapter.fetch('/historical-price-full/{symbol}', { symbol, serietype: 'line', timeseries: '365' });
  }

  /**
   * Fetch key metrics using datalake adapter
   */
  private async fetchKeyMetrics(symbol: string): Promise<any> {
    const adapter = await this.getAdapter('key-metrics');
    if (!adapter) {
      // Fallback to direct FMP
      const { API_URL, API_KEY } = await import('../../util');
      const res = await fetch(`${API_URL}/key-metrics/${symbol}?limit=4&apikey=${API_KEY}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    return adapter.fetch('/key-metrics/{symbol}', { symbol, limit: '4' });
  }

  /**
   * Fetch income statement using datalake adapter
   */
  private async fetchIncomeStatement(symbol: string): Promise<any> {
    const adapter = await this.getAdapter('income-statement');
    if (!adapter) {
      // Fallback to direct FMP
      const { API_URL, API_KEY } = await import('../../util');
      const res = await fetch(`${API_URL}/income-statement/${symbol}?limit=4&apikey=${API_KEY}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    return adapter.fetch('/income-statement/{symbol}', { symbol, limit: '4' });
  }

  /**
   * Fetch stock news using datalake adapter
   */
  private async fetchNews(symbol: string): Promise<any> {
    const adapter = await this.getAdapter('stock-news');
    if (!adapter) {
      // Fallback to direct FMP
      const { API_URL, API_KEY } = await import('../../util');
      const res = await fetch(`${API_URL}/stock_news?tickers=${symbol}&limit=6&apikey=${API_KEY}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    return adapter.fetch('/stock_news', { tickers: symbol, limit: '6' });
  }

  /**
   * Fetch financial ratios using datalake adapter
   */
  private async fetchRatios(symbol: string): Promise<any> {
    const adapter = await this.getAdapter('ratios');
    if (!adapter) {
      // Fallback to direct FMP
      const { API_URL, API_KEY } = await import('../../util');
      const res = await fetch(`${API_URL}/ratios/${symbol}?limit=3&apikey=${API_KEY}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    return adapter.fetch('/ratios/{symbol}', { symbol, limit: '3' });
  }

  /**
   * Fetch key executives using datalake adapter
   */
  private async fetchKeyExecutives(symbol: string): Promise<any> {
    const adapter = await this.getAdapter('key-executives');
    if (!adapter) {
      // Fallback to direct FMP
      const { API_URL, API_KEY } = await import('../../util');
      const res = await fetch(`${API_URL}/key-executives?symbol=${symbol}&apikey=${API_KEY}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    return adapter.fetch('/key-executives', { symbol });
  }

  /**
   * Fetch analyst estimates using datalake adapter
   */
  private async fetchAnalystEstimates(symbol: string, period: 'annual' | 'quarter' = 'annual'): Promise<any> {
    const adapter = await this.getAdapter('analyst-estimates');
    if (!adapter) {
      // Fallback to direct FMP
      const { API_URL, API_KEY } = await import('../../util');
      const res = await fetch(`${API_URL}/analyst-estimates?symbol=${symbol}&period=${period}&apikey=${API_KEY}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    return adapter.fetch('/analyst-estimates', { symbol, period });
  }

  /**
   * Fetch financial growth using datalake adapter
   */
  private async fetchFinancialGrowth(symbol: string): Promise<any> {
    const adapter = await this.getAdapter('financial-growth');
    if (!adapter) {
      // Fallback to direct FMP
      const { API_URL, API_KEY } = await import('../../util');
      const res = await fetch(`${API_URL}/financial-growth?symbol=${symbol}&apikey=${API_KEY}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    return adapter.fetch('/financial-growth', { symbol });
  }

  /**
   * Fetch DCF valuation using datalake adapter
   */
  private async fetchDCF(symbol: string): Promise<any> {
    const adapter = await this.getAdapter('discounted-cash-flow');
    if (!adapter) {
      // Fallback to direct FMP
      const { API_URL, API_KEY } = await import('../../util');
      const res = await fetch(`${API_URL}/discounted-cash-flow?symbol=${symbol}&apikey=${API_KEY}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    return adapter.fetch('/discounted-cash-flow', { symbol });
  }

  /**
   * Fetch financial scores using datalake adapter
   */
  private async fetchFinancialScores(symbol: string): Promise<any> {
    const adapter = await this.getAdapter('financial-scores');
    if (!adapter) {
      // Fallback to direct FMP
      const { API_URL, API_KEY } = await import('../../util');
      const res = await fetch(`${API_URL}/financial-scores?symbol=${symbol}&apikey=${API_KEY}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    return adapter.fetch('/financial-scores', { symbol });
  }

  /**
   * Get key executives for a stock (public method)
   */
  async getKeyExecutives(symbol: string): Promise<any[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const data = await this.fetchKeyExecutives(normalizedSymbol);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get analyst estimates for a stock (public method)
   */
  async getAnalystEstimates(symbol: string, period: 'annual' | 'quarter' = 'annual'): Promise<any[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const data = await this.fetchAnalystEstimates(normalizedSymbol, period);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get financial growth metrics for a stock (public method)
   */
  async getFinancialGrowth(symbol: string): Promise<any[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const data = await this.fetchFinancialGrowth(normalizedSymbol);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get DCF valuation for a stock (public method)
   */
  async getDCF(symbol: string): Promise<any> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const data = await this.fetchDCF(normalizedSymbol);
    return Array.isArray(data) ? data[0] : data;
  }

  /**
   * Get financial scores for a stock (public method)
   */
  async getFinancialScores(symbol: string): Promise<any> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const data = await this.fetchFinancialScores(normalizedSymbol);
    return Array.isArray(data) ? data[0] : data;
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
