/**
 * Common Stocks Controller
 * Handles HTTP requests for common stocks management (admin only)
 */

import type { CommonStocksService } from '../services/common-stocks.service';
import type { Logger } from '../logging/logger';
import type { Env } from '../index';
import { json } from '../util';
import { createErrorResponse } from '../auth/error-handler';
import { authenticateRequestWithAdmin } from '../auth/middleware';
import {
  CommonStocksResponseSchema,
  AddCommonStockRequestSchema,
  UpdateCommonStockRequestSchema,
  BulkAddCommonStocksRequestSchema,
  BulkAddCommonStocksResponseSchema,
} from '@stockly/shared/schemas';

export class CommonStocksController {
  constructor(
    private commonStocksService: CommonStocksService,
    private logger: Logger,
    private env: Env
  ) {}

  /**
   * Get common stocks list
   * GET /v1/api/admin/common-stocks?activeOnly=true
   */
  async getCommonStocks(request: Request): Promise<Response> {
    const auth = await authenticateRequestWithAdmin(
      request,
      this.env,
      this.env.JWT_SECRET || '',
      this.env.JWT_REFRESH_SECRET
    );

    if (!auth || !auth.isAdmin) {
      return createErrorResponse(
        'AUTH_REQUIRED',
        'Admin authentication required',
        undefined,
        401,
        request
      ).response;
    }

    try {
      const url = new URL(request.url);
      const activeOnly = url.searchParams.get('activeOnly') !== 'false';

      const stocks = activeOnly
        ? await this.commonStocksService.getAllActiveStocks()
        : await this.commonStocksService.getAllStocks();

      const total = await this.commonStocksService.getStocksCount(activeOnly);

      const responseData = CommonStocksResponseSchema.parse({
        stocks,
        total,
      });

      return json(responseData, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      this.logger.error('Failed to get common stocks', error, { errorMessage });
      return createErrorResponse(
        'FETCH_FAILED',
        `Failed to fetch common stocks: ${errorMessage}`,
        undefined,
        500,
        request
      ).response;
    }
  }

  /**
   * Add a new common stock
   * POST /v1/api/admin/common-stocks
   */
  async addCommonStock(request: Request): Promise<Response> {
    const auth = await authenticateRequestWithAdmin(
      request,
      this.env,
      this.env.JWT_SECRET || '',
      this.env.JWT_REFRESH_SECRET
    );

    if (!auth || !auth.isAdmin) {
      return createErrorResponse(
        'AUTH_REQUIRED',
        'Admin authentication required',
        undefined,
        401,
        request
      ).response;
    }

    try {
      const body = await request.json();

      // Validate request body
      let validated;
      try {
        validated = AddCommonStockRequestSchema.parse(body);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'Invalid request body';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const stock = await this.commonStocksService.addStock(validated.symbol, {
        name: validated.name,
        exchange: validated.exchange,
      });

      // Validate response
      const responseData = CommonStocksResponseSchema.shape.stocks.element.parse(stock);
      return json({ stock: responseData }, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      
      // Check for duplicate error
      if (errorMessage.includes('already exists')) {
        return createErrorResponse('DUPLICATE', errorMessage, undefined, 409, request).response;
      }

      this.logger.error('Failed to add common stock', error, { errorMessage });
      return createErrorResponse(
        'CREATE_FAILED',
        `Failed to add common stock: ${errorMessage}`,
        undefined,
        500,
        request
      ).response;
    }
  }

  /**
   * Update a common stock
   * PUT /v1/api/admin/common-stocks/:symbol
   */
  async updateCommonStock(request: Request, symbol: string): Promise<Response> {
    const auth = await authenticateRequestWithAdmin(
      request,
      this.env,
      this.env.JWT_SECRET || '',
      this.env.JWT_REFRESH_SECRET
    );

    if (!auth || !auth.isAdmin) {
      return createErrorResponse(
        'AUTH_REQUIRED',
        'Admin authentication required',
        undefined,
        401,
        request
      ).response;
    }

    try {
      const body = await request.json();

      // Validate request body
      let validated;
      try {
        validated = UpdateCommonStockRequestSchema.parse(body);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'Invalid request body';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const stock = await this.commonStocksService.updateStock(symbol, {
        name: validated.name,
        exchange: validated.exchange,
        isActive: validated.isActive,
      });

      // Validate response
      const responseData = CommonStocksResponseSchema.shape.stocks.element.parse(stock);
      return json({ stock: responseData }, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      
      // Check for not found error (service throws error with "not found" message)
      if (errorMessage.includes('not found') || errorMessage.includes('not found')) {
        return createErrorResponse('NOT_FOUND', `Stock with symbol ${symbol} not found`, undefined, 404, request).response;
      }

      this.logger.error('Failed to update common stock', error, { errorMessage, symbol });
      return createErrorResponse(
        'UPDATE_FAILED',
        `Failed to update common stock: ${errorMessage}`,
        undefined,
        500,
        request
      ).response;
    }
  }

  /**
   * Delete a common stock (soft delete - sets isActive = false)
   * DELETE /v1/api/admin/common-stocks/:symbol
   */
  async deleteCommonStock(request: Request, symbol: string): Promise<Response> {
    const auth = await authenticateRequestWithAdmin(
      request,
      this.env,
      this.env.JWT_SECRET || '',
      this.env.JWT_REFRESH_SECRET
    );

    if (!auth || !auth.isAdmin) {
      return createErrorResponse(
        'AUTH_REQUIRED',
        'Admin authentication required',
        undefined,
        401,
        request
      ).response;
    }

    try {
      await this.commonStocksService.removeStock(symbol);

      return json({ success: true }, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      
      // Check for not found error
      if (errorMessage.includes('not found')) {
        return createErrorResponse('NOT_FOUND', errorMessage, undefined, 404, request).response;
      }

      this.logger.error('Failed to delete common stock', error, { errorMessage, symbol });
      return createErrorResponse(
        'DELETE_FAILED',
        `Failed to delete common stock: ${errorMessage}`,
        undefined,
        500,
        request
      ).response;
    }
  }

  /**
   * Bulk add common stocks
   * POST /v1/api/admin/common-stocks/bulk
   */
  async bulkAddCommonStocks(request: Request): Promise<Response> {
    const auth = await authenticateRequestWithAdmin(
      request,
      this.env,
      this.env.JWT_SECRET || '',
      this.env.JWT_REFRESH_SECRET
    );

    if (!auth || !auth.isAdmin) {
      return createErrorResponse(
        'AUTH_REQUIRED',
        'Admin authentication required',
        undefined,
        401,
        request
      ).response;
    }

    try {
      const body = await request.json();

      // Validate request body
      let validated;
      try {
        validated = BulkAddCommonStocksRequestSchema.parse(body);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'Invalid request body';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const result = await this.commonStocksService.bulkAddStocks(validated.stocks);

      // Validate response
      const responseData = BulkAddCommonStocksResponseSchema.parse(result);
      return json(responseData, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      this.logger.error('Failed to bulk add common stocks', error, { errorMessage });
      return createErrorResponse(
        'BULK_ADD_FAILED',
        `Failed to bulk add common stocks: ${errorMessage}`,
        undefined,
        500,
        request
      ).response;
    }
  }
}

