import type { IQuotesRepository } from '../repositories/interfaces/IQuotesRepository';
import type { Quote } from '@stockly/shared/types';

export class QuotesService {
  constructor(private quotesRepo: IQuotesRepository) {}

  async getQuote(symbol: string): Promise<Quote> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (normalizedSymbol.length === 0) {
      throw new Error('Invalid symbol format');
    }
    return this.quotesRepo.getQuote(normalizedSymbol);
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const normalizedSymbols = symbols
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    if (normalizedSymbols.length === 0) {
      throw new Error('Invalid symbols format');
    }

    // Remove duplicates
    const uniqueSymbols = Array.from(new Set(normalizedSymbols));
    return this.quotesRepo.getQuotes(uniqueSymbols);
  }
}

