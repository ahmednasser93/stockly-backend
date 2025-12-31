import type { ISearchRepository } from '../repositories/interfaces/ISearchRepository';
import type { StockSearchResult } from '@stockly/shared/types';
import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { getConfig } from '../api/config';
import { isWithinWorkingHours } from '../utils/working-hours';

export class SearchService {
  constructor(
    private searchRepo: ISearchRepository,
    private env?: Env,
    private logger?: Logger
  ) {}

  async searchStocks(query: string): Promise<StockSearchResult[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    // Check working hours
    let outsideHours = false;
    if (this.env) {
      const config = await getConfig(this.env);
      outsideHours = !isWithinWorkingHours(config);

      // Outside working hours - return empty results
      if (outsideHours) {
        this.logger?.info('Outside working hours, search unavailable', {
          query: query.trim(),
        });
        return []; // Return empty array outside working hours
      }
    }

    const normalizedQuery = query.trim();
    return this.searchRepo.searchStocks(normalizedQuery);
  }
}

