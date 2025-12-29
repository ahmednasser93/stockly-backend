import type { StockSearchResult } from '@stockly/shared/types';

export interface ISearchRepository {
  searchStocks(query: string): Promise<StockSearchResult[]>;
}

