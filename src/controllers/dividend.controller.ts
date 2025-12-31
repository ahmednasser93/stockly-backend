/**
 * Dividend Controller
 * Handles HTTP requests for dividend endpoints
 */

import type { DividendService } from '../services/dividend.service';
import type { Logger } from '../logging/logger';
import type { Env } from '../index';
import { json } from '../util';
import { createErrorResponse } from '../auth/error-handler';

export class DividendController {
  constructor(
    private dividendService: DividendService,
    private logger: Logger,
    private env: Env
  ) {}

  /**
   * Get dividend data for a symbol
   * GET /v1/api/dividends/data?symbol={symbol}
   */
  async getDividendData(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const symbol = url.searchParams.get('symbol');

      if (!symbol || symbol.trim().length === 0) {
        return createErrorResponse(
          'INVALID_INPUT',
          'symbol parameter is required',
          undefined,
          400,
          request
        ).response;
      }

      if (symbol.length > 10) {
        return createErrorResponse(
          'INVALID_INPUT',
          'symbol must be 10 characters or less',
          undefined,
          400,
          request
        ).response;
      }

      const dividendData = await this.dividendService.getDividendData(symbol);

      return json(dividendData, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      this.logger.error('Failed to get dividend data', error, { errorMessage });
      return createErrorResponse(
        'FETCH_FAILED',
        `Failed to fetch dividend data: ${errorMessage}`,
        undefined,
        500,
        request
      ).response;
    }
  }

  /**
   * Calculate dividend projection
   * POST /v1/api/dividends/project
   * Body: { symbol: string, initialInvestment: number, years?: number }
   */
  async calculateProjection(request: Request): Promise<Response> {
    try {
      // Parse request body
      let body: any;
      try {
        body = await request.json();
      } catch (error) {
        return createErrorResponse(
          'INVALID_INPUT',
          'Invalid JSON in request body',
          undefined,
          400,
          request
        ).response;
      }

      // Validate symbol
      const symbol = body.symbol;
      if (!symbol || typeof symbol !== 'string' || symbol.trim().length === 0) {
        return createErrorResponse(
          'INVALID_INPUT',
          'symbol is required and must be a string',
          undefined,
          400,
          request
        ).response;
      }

      if (symbol.length > 10) {
        return createErrorResponse(
          'INVALID_INPUT',
          'symbol must be 10 characters or less',
          undefined,
          400,
          request
        ).response;
      }

      // Validate initialInvestment
      const initialInvestment = body.initialInvestment;
      if (initialInvestment == null || typeof initialInvestment !== 'number') {
        return createErrorResponse(
          'INVALID_INPUT',
          'initialInvestment is required and must be a number',
          undefined,
          400,
          request
        ).response;
      }

      if (initialInvestment < 100) {
        return createErrorResponse(
          'INVALID_INPUT',
          'initialInvestment must be at least $100',
          undefined,
          400,
          request
        ).response;
      }

      if (initialInvestment > 100000000) {
        return createErrorResponse(
          'INVALID_INPUT',
          'initialInvestment must be at most $100,000,000',
          undefined,
          400,
          request
        ).response;
      }

      // Validate years (optional, default: 10)
      let years = body.years ?? 10;
      if (typeof years !== 'number') {
        return createErrorResponse(
          'INVALID_INPUT',
          'years must be a number',
          undefined,
          400,
          request
        ).response;
      }

      if (years < 1) {
        return createErrorResponse(
          'INVALID_INPUT',
          'years must be at least 1',
          undefined,
          400,
          request
        ).response;
      }

      if (years > 30) {
        return createErrorResponse(
          'INVALID_INPUT',
          'years must be at most 30',
          undefined,
          400,
          request
        ).response;
      }

      // Round years to integer
      years = Math.round(years);

      // Get dividend data first
      const dividendData = await this.dividendService.getDividendData(symbol);

      // Check if stock has dividend data
      if (dividendData.currentYield == null || dividendData.currentYield <= 0) {
        return createErrorResponse(
          'NO_DIVIDEND_DATA',
          'This stock does not pay dividends or dividend data is not available',
          undefined,
          404,
          request
        ).response;
      }

      // Check if we have sufficient data for projection
      if (dividendData.hasInsufficientData || dividendData.dividendGrowthRate == null) {
        return createErrorResponse(
          'INSUFFICIENT_DATA',
          'Insufficient historical dividend data for accurate projection. At least 2 years of dividend history required.',
          undefined,
          400,
          request
        ).response;
      }

      // Calculate projection
      const projection = this.dividendService.calculateProjection({
        symbol,
        initialInvestment,
        currentYield: dividendData.currentYield,
        dividendGrowthRate: dividendData.dividendGrowthRate,
        years,
      });

      return json(projection, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      this.logger.error('Failed to calculate dividend projection', error, { errorMessage });
      
      // Handle specific error types
      if (errorMessage.includes('Invalid projection parameters')) {
        return createErrorResponse(
          'INVALID_INPUT',
          errorMessage,
          undefined,
          400,
          request
        ).response;
      }

      return createErrorResponse(
        'CALCULATION_FAILED',
        `Failed to calculate projection: ${errorMessage}`,
        undefined,
        500,
        request
      ).response;
    }
  }
}

