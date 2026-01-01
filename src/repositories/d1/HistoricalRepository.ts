import type { IHistoricalRepository } from '../interfaces/IHistoricalRepository';
import type { IDatabase } from '../../infrastructure/database/IDatabase';
import type { HistoricalPriceData, IntradayCandle } from '@stockly/shared/types';
import { getHistoricalPricesByDateRange, fetchAndSaveHistoricalPrice } from '../../api/historical-prices';
import { API_KEY } from '../../util';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';
import type { DatalakeService } from '../../services/datalake.service';

/**
 * Parse interval string to minutes
 */
function parseIntervalToMinutes(interval: string): number {
  const match = interval.match(/^(\d+)([hm])$/);
  if (!match) {
    throw new Error(`Invalid interval format: ${interval}. Expected format: "1h", "4h", "30m", etc.`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (unit === 'h') {
    return value * 60;
  } else if (unit === 'm') {
    return value;
  }

  throw new Error(`Invalid interval unit: ${unit}. Expected 'h' or 'm'.`);
}

/**
 * Round timestamp down to interval boundary
 */
function roundToIntervalBoundary(timestamp: Date, intervalMinutes: number): Date {
  const ms = timestamp.getTime();
  const intervalMs = intervalMinutes * 60 * 1000;
  const roundedMs = Math.floor(ms / intervalMs) * intervalMs;
  return new Date(roundedMs);
}

/**
 * Aggregate 30-minute OHLC data into specified interval
 */
function aggregateToInterval(
  data: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>,
  interval: string
): IntradayCandle[] {
  if (data.length === 0) return [];

  const intervalMinutes = parseIntervalToMinutes(interval);
  const candles = new Map<
    string,
    {
      date: string;
      open: number | null;
      high: number | null;
      low: number | null;
      close: number | null;
      volume: number;
      timestamp: number;
    }
  >();

  // Sort data by date (oldest first) to ensure proper aggregation
  const sortedData = [...data].sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  for (const record of sortedData) {
    const timestamp = new Date(record.date);
    const intervalStart = roundToIntervalBoundary(timestamp, intervalMinutes);
    const key = intervalStart.toISOString();

    if (!candles.has(key)) {
      candles.set(key, {
        date: key,
        open: null,
        high: null,
        low: null,
        close: null,
        volume: 0,
        timestamp: intervalStart.getTime(),
      });
    }

    const candle = candles.get(key)!;

    // First record in interval sets the open
    if (candle.open === null) {
      candle.open = record.open;
    }

    // Track highest high
    if (candle.high === null || record.high > candle.high) {
      candle.high = record.high;
    }

    // Track lowest low
    if (candle.low === null || record.low < candle.low) {
      candle.low = record.low;
    }

    // Last record in interval sets the close
    candle.close = record.close;

    // Sum volumes
    candle.volume += record.volume;
  }

  // Convert to array and sort by timestamp
  return Array.from(candles.values())
    .filter((c) => c.open !== null && c.high !== null && c.low !== null && c.close !== null)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((c) => ({
      date: c.date,
      open: c.open!,
      high: c.high!,
      low: c.low!,
      close: c.close!,
      volume: c.volume,
    }));
}

/**
 * Fetch 30-minute data using datalake adapter
 */
async function fetch30MinuteData(
  symbol: string, 
  fromDate: string, 
  toDate: string, 
  env: Env,
  datalakeService?: DatalakeService
): Promise<Array<{
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}>> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const apiKey = env.FMP_API_KEY ?? API_KEY;

  let data: any;

  // Try datalake adapter first
  if (datalakeService) {
    try {
      const adapter = await datalakeService.getAdapterForEndpoint('historical-chart-30min', apiKey);
      if (adapter) {
        data = await adapter.fetch('/historical-chart/30min', {
          symbol: normalizedSymbol,
          from: fromDate,
          to: toDate,
        });
      } else {
        // Fallback to direct FMP
        const { API_URL } = await import('../../util');
        const apiUrl = `${API_URL}/historical-chart/30min?symbol=${normalizedSymbol}&apikey=${apiKey}&from=${fromDate}&to=${toDate}`;
        const response = await fetch(apiUrl);
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`Failed to fetch 30-minute data: HTTP ${response.status}`);
        }
        data = await response.json();
      }
    } catch (error) {
      // Fallback to direct FMP on error
      const { API_URL } = await import('../../util');
      const apiUrl = `${API_URL}/historical-chart/30min?symbol=${normalizedSymbol}&apikey=${apiKey}&from=${fromDate}&to=${toDate}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Failed to fetch 30-minute data: HTTP ${response.status}`);
      }
      data = await response.json();
    }
  } else {
    // Fallback to direct FMP
    const { API_URL } = await import('../../util');
    const apiUrl = `${API_URL}/historical-chart/30min?symbol=${normalizedSymbol}&apikey=${apiKey}&from=${fromDate}&to=${toDate}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Failed to fetch 30-minute data: HTTP ${response.status}`);
    }
    data = await response.json();
  }

  // Check for API errors
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const errorData = data as Record<string, any>;
    if ('Error Message' in errorData || 'error' in errorData) {
      const errorMsg = errorData['Error Message'] || errorData.error || JSON.stringify(data);
      throw new Error(`FMP API error: ${errorMsg}`);
    }
  }

  if (!Array.isArray(data)) {
    return [];
  }

  // Filter out invalid records
  return data.filter(
    (record) =>
      record.date &&
      typeof record.open === 'number' &&
      typeof record.high === 'number' &&
      typeof record.low === 'number' &&
      typeof record.close === 'number' &&
      typeof record.volume === 'number'
  );
}

/**
 * Format date as YYYY-MM-DD string
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export class HistoricalRepository implements IHistoricalRepository {
  constructor(
    private db: IDatabase, 
    private env: Env, 
    private logger: Logger,
    private datalakeService?: DatalakeService
  ) {}

  async getHistoricalPrices(symbol: string, fromDate: Date, toDate: Date): Promise<HistoricalPriceData[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const data = await getHistoricalPricesByDateRange(normalizedSymbol, fromDate, toDate, this.env as any);

    return data.map((record) => ({
      date: record.date,
      price: record.price,
      open: record.open ?? null,
      high: record.high ?? null,
      low: record.low ?? null,
      close: record.close ?? record.price, // Use price as close if close is null
      volume: record.volume ?? null,
    }));
  }

  async fetchAndSaveHistoricalPrice(symbol: string, fromDate?: string, toDate?: string): Promise<void> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    // Create a minimal ExecutionContext
    const ctx = {
      waitUntil: () => {},
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext;

    await fetchAndSaveHistoricalPrice(normalizedSymbol, this.env as any, ctx, fromDate, toDate);
  }

  async getHistoricalIntraday(symbol: string, interval: string, days: number): Promise<IntradayCandle[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();

    // Calculate date range
    const toDate = new Date();
    const fromDate = new Date(toDate);
    fromDate.setDate(fromDate.getDate() - days);

    const fromDateStr = formatDate(fromDate);
    const toDateStr = formatDate(toDate);

    // Fetch 30-minute data using datalake adapter
    const thirtyMinData = await fetch30MinuteData(normalizedSymbol, fromDateStr, toDateStr, this.env, this.datalakeService);

    if (thirtyMinData.length === 0) {
      return [];
    }

    // Aggregate to requested interval
    return aggregateToInterval(thirtyMinData, interval);
  }
}

