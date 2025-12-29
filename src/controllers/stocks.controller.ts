/**
 * Stock Controller
 * Handles HTTP requests for stock operations
 */

import type { StockService } from '../services/stocks.service';
import { json } from '../util';
import type { Logger } from '../logging/logger';
import { createErrorResponse } from '../auth/error-handler';
import { validateRequest } from '@stockly/shared/validators';
import { GetStockDetailsRequestSchema, StockDetailsResponseSchema } from '@stockly/shared/schemas';
import type { Env } from '../index';

export class StockController {
  constructor(
    private stockService: StockService,
    private logger: Logger,
    private env: Env
  ) {}

  /**
   * GET /v1/api/get-stock-details?symbol=AAPL
   * Get comprehensive stock details
   */
  async getStockDetails(request: Request, symbol: string): Promise<Response> {
    try {
      // Validate symbol using Zod schema
      const validated = GetStockDetailsRequestSchema.parse({ symbol });
      const stockDetails = await this.stockService.getStockDetails(validated.symbol);
      return json(StockDetailsResponseSchema.parse({ stockDetails }), 200, request);
    } catch (error) {
      this.logger.error('Failed to get stock details', error, { symbol });
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve stock details';
      const statusCode = errorMessage.includes('Invalid symbol') ? 400 : 500;
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }
}

