import type { Quote, QuotesResponse } from '@stockly/shared/types';

export interface IQuotesRepository {
  getQuote(symbol: string): Promise<Quote>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
}

