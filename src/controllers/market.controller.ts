/**
 * Market Controller
 * Handles HTTP requests for market endpoints (gainers, losers, actives)
 */

import type { MarketService } from '../services/market.service';
import type { Logger } from '../logging/logger';
import type { Env } from '../index';
import { json } from '../util';
import { createErrorResponse } from '../auth/error-handler';
import { MarketResponseSchema, GetMarketRequestSchema, GetScreenerRequestSchema, SectorsResponseSchema, PaginatedMarketResponseSchema, PaginationMetaSchema } from '@stockly/shared/schemas';

export class MarketController {
  constructor(
    private marketService: MarketService,
    private logger: Logger,
    private env: Env
  ) {}

  /**
   * Get top gainers
   * GET /v1/api/market/gainers?limit=10&offset=0
   */
  async getGainers(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      
      // Validate request
      let validated;
      try {
        validated = GetMarketRequestSchema.parse(queryParams);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'Invalid parameters';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const limit = validated.limit ?? 10;
      const offset = validated.offset ?? 0;
      
      // Fetch data from service (with pagination)
      const data = await this.marketService.getGainers(limit, offset);
      
      // For pagination, we need to get total count from cache or estimate
      // Since we don't have the total easily available, we'll use hasMore based on returned data length
      const hasMore = data.length === limit; // If we got exactly limit items, there might be more
      
      // Build pagination metadata
      const pagination = {
        offset,
        limit,
        total: offset + data.length + (hasMore ? 1 : 0), // Estimate - actual total would require full cache read
        hasMore,
      };

      // Validate and return response
      const responseData = PaginatedMarketResponseSchema.parse({
        data,
        pagination,
      });
      return json(responseData, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      this.logger.error('Failed to get gainers', error, { errorMessage });
      return createErrorResponse('FETCH_FAILED', `Failed to fetch gainers: ${errorMessage}`, undefined, 500, request).response;
    }
  }

  /**
   * Get top losers
   * GET /v1/api/market/losers?limit=10&offset=0
   */
  async getLosers(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      
      // Validate request
      let validated;
      try {
        validated = GetMarketRequestSchema.parse(queryParams);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'Invalid parameters';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const limit = validated.limit ?? 10;
      const offset = validated.offset ?? 0;
      
      // Fetch data from service (with pagination)
      const data = await this.marketService.getLosers(limit, offset);
      
      // Build pagination metadata
      const hasMore = data.length === limit;
      const pagination = {
        offset,
        limit,
        total: offset + data.length + (hasMore ? 1 : 0),
        hasMore,
      };

      // Validate and return response
      const responseData = PaginatedMarketResponseSchema.parse({
        data,
        pagination,
      });
      return json(responseData, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      this.logger.error('Failed to get losers', error, { errorMessage });
      return createErrorResponse('FETCH_FAILED', `Failed to fetch losers: ${errorMessage}`, undefined, 500, request).response;
    }
  }

  /**
   * Get most active stocks
   * GET /v1/api/market/actives?limit=10&offset=0
   */
  async getActives(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      
      // Validate request
      let validated;
      try {
        validated = GetMarketRequestSchema.parse(queryParams);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'Invalid parameters';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const limit = validated.limit ?? 10;
      const offset = validated.offset ?? 0;
      
      // Fetch data from service (with pagination)
      const data = await this.marketService.getActives(limit, offset);
      
      // For pagination, we need to get total count from cache or estimate
      // Since we don't have the total easily available, we'll use hasMore based on returned data length
      const hasMore = data.length === limit; // If we got exactly limit items, there might be more
      
      // Build pagination metadata
      const pagination = {
        offset,
        limit,
        total: offset + data.length + (hasMore ? 1 : 0), // Estimate - actual total would require full cache read
        hasMore,
      };

      // Validate and return response
      const responseData = PaginatedMarketResponseSchema.parse({
        data,
        pagination,
      });
      return json(responseData, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      this.logger.error('Failed to get actives', error, { errorMessage });
      return createErrorResponse('FETCH_FAILED', `Failed to fetch actives: ${errorMessage}`, undefined, 500, request).response;
    }
  }

  /**
   * Get screener results
   * GET /v1/api/market/screener?marketCapMoreThan=1000000000&peLowerThan=20&dividendMoreThan=2&limit=50
   */
  async getScreener(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      
      // Validate request
      let validated;
      try {
        validated = GetScreenerRequestSchema.parse(queryParams);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'Invalid screener parameters';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const {
        marketCapMoreThan = 1000000000,
        peLowerThan = 20,
        dividendMoreThan = 2,
        limit = 50
      } = validated;
      
      // Fetch data from service
      const data = await this.marketService.getScreener(marketCapMoreThan, peLowerThan, dividendMoreThan, limit);
      
      // Validate and return response
      const responseData = MarketResponseSchema.parse(data);
      return json(responseData, 200, request);
    } catch (error) {
      this.logger.error('Failed to get screener', error);
      return createErrorResponse('FETCH_FAILED', 'Failed to fetch screener data', undefined, 500, request).response;
    }
  }

  /**
   * Get sectors performance
   * GET /v1/api/market/sectors-performance
   */
  async getSectorsPerformance(request: Request): Promise<Response> {
    try {
      // Fetch data from service (no query parameters needed)
      const data = await this.marketService.getSectorsPerformance();
      
      // Validate and return response
      const responseData = SectorsResponseSchema.parse(data);
      return json(responseData, 200, request);
    } catch (error) {
      this.logger.error('Failed to get sectors performance', error);
      return createErrorResponse('FETCH_FAILED', 'Failed to fetch sectors performance', undefined, 500, request).response;
    }
  }
}

