/**
 * Stock Controller
 * Handles HTTP requests for stock operations
 */

import type { StockService } from '../services/stocks.service';
import { json } from '../util';
import type { Logger } from '../logging/logger';
import { createErrorResponse } from '../auth/error-handler';
import { validateRequest } from '@stockly/shared/validators';
import { GetStockDetailsRequestSchema, StockDetailsResponseSchema, GetStockResourceRequestSchema, KeyExecutiveSchema, AnalystEstimateSchema, FinancialGrowthSchema, DCFSchema, FinancialScoresSchema } from '@stockly/shared/schemas';
import { z } from 'zod';
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

  /**
   * GET /v1/api/stocks/{symbol}/executives
   * Get key executives for a stock
   */
  async getKeyExecutives(request: Request, symbol: string): Promise<Response> {
    try {
      // Validate symbol
      const validated = GetStockResourceRequestSchema.parse({ symbol });
      const data = await this.stockService.getKeyExecutives(validated.symbol);
      
      // Validate and return response
      const responseData = z.array(KeyExecutiveSchema).parse(data);
      return json(responseData, 200, request);
    } catch (error) {
      this.logger.error('Failed to get key executives', error, { symbol });
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve key executives';
      const statusCode = errorMessage.includes('Invalid symbol') ? 400 : 500;
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }

  /**
   * GET /v1/api/stocks/{symbol}/analyst-estimates?period=annual
   * Get analyst estimates for a stock
   */
  async getAnalystEstimates(request: Request, symbol: string): Promise<Response> {
    try {
      const url = new URL(request.url);
      const period = url.searchParams.get('period') as 'annual' | 'quarter' | null;
      
      // Validate symbol and period
      const validated = GetStockResourceRequestSchema.parse({ 
        symbol,
        period: period || undefined,
      });
      const data = await this.stockService.getAnalystEstimates(validated.symbol, validated.period || 'annual');
      
      // Validate and return response
      const responseData = z.array(AnalystEstimateSchema).parse(data);
      return json(responseData, 200, request);
    } catch (error) {
      this.logger.error('Failed to get analyst estimates', error, { symbol });
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve analyst estimates';
      const statusCode = errorMessage.includes('Invalid symbol') ? 400 : 500;
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }

  /**
   * GET /v1/api/stocks/{symbol}/financial-growth
   * Get financial growth metrics for a stock
   */
  async getFinancialGrowth(request: Request, symbol: string): Promise<Response> {
    try {
      // Validate symbol
      const validated = GetStockResourceRequestSchema.parse({ symbol });
      const data = await this.stockService.getFinancialGrowth(validated.symbol);
      
      // Validate and return response
      const responseData = z.array(FinancialGrowthSchema).parse(data);
      return json(responseData, 200, request);
    } catch (error) {
      this.logger.error('Failed to get financial growth', error, { symbol });
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve financial growth';
      const statusCode = errorMessage.includes('Invalid symbol') ? 400 : 500;
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }

  /**
   * GET /v1/api/stocks/{symbol}/dcf
   * Get DCF valuation for a stock
   */
  async getDCF(request: Request, symbol: string): Promise<Response> {
    try {
      // Validate symbol
      const validated = GetStockResourceRequestSchema.parse({ symbol });
      const data = await this.stockService.getDCF(validated.symbol);
      
      // Validate and return response
      const responseData = DCFSchema.parse(data);
      return json(responseData, 200, request);
    } catch (error) {
      this.logger.error('Failed to get DCF', error, { symbol });
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve DCF valuation';
      const statusCode = errorMessage.includes('Invalid symbol') ? 400 : 500;
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }

  /**
   * GET /v1/api/stocks/{symbol}/financial-scores
   * Get financial scores for a stock
   */
  async getFinancialScores(request: Request, symbol: string): Promise<Response> {
    try {
      // Validate symbol
      const validated = GetStockResourceRequestSchema.parse({ symbol });
      const data = await this.stockService.getFinancialScores(validated.symbol);
      
      // Validate and return response
      const responseData = FinancialScoresSchema.parse(data);
      return json(responseData, 200, request);
    } catch (error) {
      this.logger.error('Failed to get financial scores', error, { symbol });
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve financial scores';
      const statusCode = errorMessage.includes('Invalid symbol') ? 400 : 500;
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }
}

