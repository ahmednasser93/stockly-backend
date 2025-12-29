import type { HistoricalPriceData, IntradayCandle } from '@stockly/shared/types';

export interface IHistoricalRepository {
  getHistoricalPrices(symbol: string, fromDate: Date, toDate: Date): Promise<HistoricalPriceData[]>;
  fetchAndSaveHistoricalPrice(symbol: string, fromDate?: string, toDate?: string): Promise<void>;
  getHistoricalIntraday(symbol: string, interval: string, days: number): Promise<IntradayCandle[]>;
}

