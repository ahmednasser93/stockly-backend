/**
 * Dividend Service
 * Service layer with caching logic for dividend data and projection calculations
 */

import type { DividendRepository, DividendHistory } from '../repositories/external/DividendRepository';
import type { Env } from '../index';
import type { Logger } from '../logging/logger';

export interface DividendData {
  symbol: string;
  currentYield: number | null;
  dividendGrowthRate: number | null;
  last5YearsDividends: DividendHistory[];
  hasInsufficientData: boolean;
}

export interface ProjectionParams {
  initialInvestment: number;
  currentYield: number;
  dividendGrowthRate: number;
  years: number; // default: 10
}

export interface ProjectionYear {
  year: number;
  dividendReinvested: number;
  dividendSpent: number;
  cumulativeReinvested: number;
  cumulativeSpent: number;
  principalReinvested: number;
}

export interface ProjectionResult {
  years: ProjectionYear[];
  totalDividendsReinvested: number;
  totalDividendsSpent: number;
  finalPrincipalReinvested: number;
  insight: string;
}

interface DividendCacheEntry {
  data: DividendData;
  cachedAt: number;
  expiresAt: number;
}

const DEFAULT_TTL_SECONDS = 86400; // 24 hours (dividends don't change frequently)

export class DividendService {
  constructor(
    private repository: DividendRepository,
    private env: Env,
    private logger?: Logger
  ) {}

  /**
   * Get dividend data for a symbol (with caching)
   */
  async getDividendData(symbol: string): Promise<DividendData> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const cacheKey = `dividend:data:${normalizedSymbol}`;
    const kv = this.env.marketKv; // Reuse marketKv namespace

    // Check cache first
    if (kv) {
      const cached = await this.getDividendDataFromKV(kv, cacheKey);
      if (cached) {
        this.logger?.info('Cache hit for dividend data', {
          symbol: normalizedSymbol,
          cachedAt: cached.cachedAt,
        });
        return cached.data;
      }
    }

    // Cache miss - fetch from repository
    this.logger?.info('No cached dividend data, fetching from FMP API', {
      symbol: normalizedSymbol,
    });

    try {
      // Fetch historical dividends and current yield in parallel
      const [historicalDividends, currentYield] = await Promise.all([
        this.repository.getHistoricalDividends(normalizedSymbol),
        this.repository.getCurrentYield(normalizedSymbol),
      ]);

      // Calculate DGR
      const dividendGrowthRate = this.calculateDGR(historicalDividends);

      // Get last 5 years of dividends
      const last5YearsDividends = this.getLast5YearsDividends(historicalDividends);

      // Check if we have insufficient data (< 2 years)
      const hasInsufficientData = last5YearsDividends.length < 2;

      const dividendData: DividendData = {
        symbol: normalizedSymbol,
        currentYield,
        dividendGrowthRate,
        last5YearsDividends,
        hasInsufficientData,
      };

      // Store in cache (non-blocking)
      if (kv) {
        this.setDividendDataToKV(kv, cacheKey, dividendData, DEFAULT_TTL_SECONDS).catch(error => {
          this.logger?.warn('Failed to cache dividend data', error);
        });
      }

      return dividendData;
    } catch (error) {
      this.logger?.error('Failed to fetch dividend data', error);
      throw error;
    }
  }

  /**
   * Calculate Dividend Growth Rate (DGR) from historical dividends
   * Uses CAGR formula: (latestYear / earliestYear)^(1/years) - 1
   */
  calculateDGR(historicalDividends: DividendHistory[]): number | null {
    if (historicalDividends.length < 2) {
      return null;
    }

    // Group dividends by year and sum them
    const annualDividends = this.getAnnualDividends(historicalDividends);

    if (annualDividends.length < 2) {
      return null;
    }

    // Get earliest and latest year dividends
    const sortedYears = Object.keys(annualDividends).sort((a, b) => parseInt(a) - parseInt(b));
    const earliestYear = sortedYears[0];
    const latestYear = sortedYears[sortedYears.length - 1];

    const earliestDiv = annualDividends[earliestYear];
    const latestDiv = annualDividends[latestYear];

    if (earliestDiv <= 0 || latestDiv <= 0) {
      return null;
    }

    const years = parseInt(latestYear) - parseInt(earliestYear);
    if (years <= 0) {
      return null;
    }

    // Calculate CAGR: (latest / earliest)^(1/years) - 1
    const cagr = Math.pow(latestDiv / earliestDiv, 1 / years) - 1;

    // Handle edge cases
    if (!isFinite(cagr) || isNaN(cagr)) {
      return null;
    }

    // Cap at reasonable values (e.g., -90% to 1000% annual growth)
    return Math.max(-0.9, Math.min(10, cagr));
  }

  /**
   * Group dividends by year and sum them
   */
  private getAnnualDividends(historicalDividends: DividendHistory[]): Record<string, number> {
    const annual: Record<string, number> = {};

    for (const div of historicalDividends) {
      const year = new Date(div.date).getFullYear().toString();
      annual[year] = (annual[year] || 0) + div.dividend;
    }

    return annual;
  }

  /**
   * Get last 5 years of dividends (most recent 5 years)
   */
  private getLast5YearsDividends(historicalDividends: DividendHistory[]): DividendHistory[] {
    if (historicalDividends.length === 0) {
      return [];
    }

    // Dividends are already sorted descending (newest first) from repository
    const currentYear = new Date().getFullYear();
    const fiveYearsAgo = currentYear - 5;

    return historicalDividends.filter(div => {
      const year = new Date(div.date).getFullYear();
      return year > fiveYearsAgo;
    });
  }

  /**
   * Calculate 10-year dividend projection
   */
  calculateProjection(params: ProjectionParams & { symbol?: string }): ProjectionResult {
    const { initialInvestment, currentYield, dividendGrowthRate, years, symbol } = params;

    // Validate inputs
    if (initialInvestment <= 0 || currentYield <= 0 || years <= 0) {
      throw new Error('Invalid projection parameters');
    }

    const yearsArray: ProjectionYear[] = [];
    let principalReinvested = initialInvestment;
    let cumulativeReinvested = 0;
    let cumulativeSpent = 0;

    // Calculate for each year
    for (let year = 1; year <= years; year++) {
      // Calculate dividend for this year
      // Year 1 uses current yield, subsequent years grow by DGR
      const yieldMultiplier = Math.pow(1 + dividendGrowthRate, year - 1);
      const currentYearYield = currentYield * yieldMultiplier;

      // With reinvestment: dividend is calculated on current principal
      const dividendReinvested = principalReinvested * currentYearYield;
      cumulativeReinvested += dividendReinvested;
      principalReinvested += dividendReinvested; // Reinvest the dividend

      // Without reinvestment: dividend is calculated on initial investment
      const dividendSpent = initialInvestment * currentYearYield;
      cumulativeSpent += dividendSpent;

      yearsArray.push({
        year,
        dividendReinvested,
        dividendSpent,
        cumulativeReinvested,
        cumulativeSpent,
        principalReinvested,
      });
    }

    // Generate insight message
    const insight = this.generateInsight(
      params.symbol || 'this stock',
      cumulativeReinvested,
      cumulativeSpent,
      years
    );

    return {
      years: yearsArray,
      totalDividendsReinvested: cumulativeReinvested,
      totalDividendsSpent: cumulativeSpent,
      finalPrincipalReinvested: principalReinvested,
      insight,
    };
  }

  /**
   * Generate an insight message based on projection results
   */
  private generateInsight(
    symbol: string,
    totalReinvested: number,
    totalSpent: number,
    years: number
  ): string {
    // Calculate monthly dividend if reinvested (using last year's projection)
    const monthlyDividend = totalReinvested / (years * 12);

    // Common expense categories with thresholds
    const expenseCategories = [
      { name: 'monthly groceries', threshold: 400 },
      { name: 'monthly utilities', threshold: 150 },
      { name: 'monthly coffee habit', threshold: 100 },
      { name: 'monthly subscription services', threshold: 50 },
    ];

    // Find the best matching expense category
    let bestMatch = expenseCategories.find(cat => monthlyDividend >= cat.threshold);
    if (!bestMatch) {
      bestMatch = expenseCategories[expenseCategories.length - 1];
    }

    const formattedMonthly = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(monthlyDividend);

    const formattedTotal = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(totalReinvested);

    if (monthlyDividend >= bestMatch.threshold) {
      return `In ${years} years, your ${symbol} position could pay for your ${bestMatch.name} (${formattedMonthly}/mo). Total dividends: ${formattedTotal}.`;
    } else {
      return `In ${years} years, you could earn ${formattedTotal} in dividends from your ${symbol} position.`;
    }
  }

  /**
   * Get dividend data from KV cache
   */
  private async getDividendDataFromKV(
    kv: any,
    key: string
  ): Promise<{ data: DividendData; cachedAt: number } | null> {
    try {
      const raw = await kv.get(key);
      if (!raw) {
        return null;
      }

      const entry = JSON.parse(raw) as DividendCacheEntry;

      if (!entry.data || !entry.cachedAt || !entry.expiresAt) {
        return null;
      }

      const now = Date.now();
      if (now > entry.expiresAt) {
        return null;
      }

      return {
        data: entry.data,
        cachedAt: entry.cachedAt,
      };
    } catch (error) {
      this.logger?.warn(`Failed to read dividend cache for key ${key}`, error);
      return null;
    }
  }

  /**
   * Store dividend data in KV cache
   */
  private async setDividendDataToKV(
    kv: any,
    key: string,
    data: DividendData,
    ttlSeconds: number
  ): Promise<void> {
    try {
      const now = Date.now();
      const cacheEntry: DividendCacheEntry = {
        data,
        cachedAt: now,
        expiresAt: now + ttlSeconds * 1000,
      };

      await kv.put(key, JSON.stringify(cacheEntry));
    } catch (error) {
      this.logger?.warn(`Failed to cache dividend data for key ${key}`, error);
      throw error;
    }
  }
}

