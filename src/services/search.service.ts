import type { ISearchRepository } from '../repositories/interfaces/ISearchRepository';
import type { StockSearchResult } from '@stockly/shared/types';

export class SearchService {
  constructor(private searchRepo: ISearchRepository) {}

  async searchStocks(query: string): Promise<StockSearchResult[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const normalizedQuery = query.trim();
    return this.searchRepo.searchStocks(normalizedQuery);
  }
}

