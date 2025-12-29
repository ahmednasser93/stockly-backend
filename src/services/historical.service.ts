import type { IHistoricalRepository } from '../repositories/interfaces/IHistoricalRepository';
import type { HistoricalPriceData, IntradayCandle } from '@stockly/shared/types';

export class HistoricalService {
  constructor(private historicalRepo: IHistoricalRepository) {}

  async getHistoricalPrices(
    symbol: string,
    fromDate: Date,
    toDate: Date,
    fetchIfMissing: boolean = true
  ): Promise<HistoricalPriceData[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      throw new Error('Invalid symbol format');
    }

    let data = await this.historicalRepo.getHistoricalPrices(normalizedSymbol, fromDate, toDate);

    // Check if OHLC data is missing
    const hasMissingOHLC = data.length > 0 && data.some((record) => record.open === null || record.high === null || record.low === null);

    // If database is empty OR has missing OHLC data, fetch from FMP API
    if (fetchIfMissing && (data.length === 0 || hasMissingOHLC)) {
      try {
        await this.historicalRepo.fetchAndSaveHistoricalPrice(normalizedSymbol, fromDate.toISOString().split('T')[0], toDate.toISOString().split('T')[0]);
        // Wait a bit for database write to complete
        await new Promise((resolve) => setTimeout(resolve, 500));
        // Try to get data from database again
        data = await this.historicalRepo.getHistoricalPrices(normalizedSymbol, fromDate, toDate);
      } catch (error) {
        // Log error but continue with existing data
        console.error(`Error fetching historical data from FMP API for ${normalizedSymbol}:`, error);
      }
    }

    return data;
  }

  async getHistoricalIntraday(symbol: string, interval: string, days: number): Promise<IntradayCandle[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      throw new Error('Invalid symbol format');
    }

    if (days <= 0 || days > 30) {
      throw new Error('days parameter must be between 1 and 30');
    }

    // Validate interval format
    try {
      const match = interval.match(/^(\d+)([hm])$/);
      if (!match) {
        throw new Error(`Invalid interval format: ${interval}. Expected format: "1h", "4h", "30m", etc.`);
      }
    } catch (error) {
      throw new Error(`Invalid interval format: ${interval}. Expected format: "1h", "4h", "30m", etc.`);
    }

    return this.historicalRepo.getHistoricalIntraday(normalizedSymbol, interval, days);
  }
}

