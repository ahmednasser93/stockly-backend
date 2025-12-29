import type { SearchService } from '../services/search.service';
import { json } from '../util';
import type { Logger } from '../logging/logger';
import { createErrorResponse } from '../auth/error-handler';
import { StockSearchResponseSchema, SearchStockRequestSchema } from '@stockly/shared/schemas';
import type { Env } from '../index';

export class SearchController {
  constructor(
    private searchService: SearchService,
    private logger: Logger,
    private env: Env
  ) {}

  async searchStock(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const query = url.searchParams.get('query');

      if (!query) {
        return json([], 200, request);
      }

      const validated = SearchStockRequestSchema.parse({ query });
      const results = await this.searchService.searchStocks(validated.query);
      return json(StockSearchResponseSchema.parse(results), 200, request);
    } catch (error) {
      this.logger.error('Failed to search stocks', error);
      if (error instanceof Error && error.message.includes('Failed to search')) {
        return createErrorResponse('FETCH_FAILED', error.message, undefined, 500, request).response;
      }
      return json([], 200, request); // Return empty array on error for search
    }
  }
}

