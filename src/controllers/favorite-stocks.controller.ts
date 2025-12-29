import type { FavoriteStocksService } from '../services/favorite-stocks.service';
import { json } from '../util';
import type { Logger } from '../logging/logger';
import { createErrorResponse } from '../auth/error-handler';
import { authenticateRequest, authenticateRequestWithAdmin } from '../auth/middleware';
import {
  FavoriteStocksResponseSchema,
  UpdateFavoriteStocksRequestSchema,
  UpdateFavoriteStocksResponseSchema,
  AllUsersFavoriteStocksResponseSchema,
} from '@stockly/shared/schemas';
import type { Env } from '../index';

export class FavoriteStocksController {
  constructor(
    private favoriteStocksService: FavoriteStocksService,
    private logger: Logger,
    private env: Env
  ) {}

  async getFavoriteStocks(request: Request): Promise<Response> {
    const auth = await authenticateRequest(request, this.env.JWT_SECRET || '', this.env.JWT_REFRESH_SECRET);
    if (!auth) {
      return createErrorResponse('AUTH_MISSING_TOKEN', 'Authentication required', undefined, 401, request).response;
    }
    const username = auth.username;

    try {
      const stocks = await this.favoriteStocksService.getFavoriteStocks(username);
      return json(FavoriteStocksResponseSchema.parse({ stocks }), 200, request);
    } catch (error) {
      this.logger.error('Failed to get favorite stocks', error, { username });
      return createErrorResponse('FETCH_FAILED', 'Failed to retrieve favorite stocks', undefined, 500, request).response;
    }
  }

  async updateFavoriteStocks(request: Request): Promise<Response> {
    const auth = await authenticateRequest(request, this.env.JWT_SECRET || '', this.env.JWT_REFRESH_SECRET);
    if (!auth) {
      return createErrorResponse('AUTH_MISSING_TOKEN', 'Authentication required', undefined, 401, request).response;
    }
    const username = auth.username;

    try {
      const payload = await request.json();
      const validated = UpdateFavoriteStocksRequestSchema.parse(payload);

      const stocks = await this.favoriteStocksService.updateFavoriteStocks(username, validated.symbols);
      return json(
        UpdateFavoriteStocksResponseSchema.parse({
          success: true,
          message: stocks.length > 0 ? 'Favorite stocks updated' : 'All favorite stocks cleared',
          stocks,
        }),
        200,
        request
      );
    } catch (error) {
      this.logger.error('Failed to update favorite stocks', error, { username });
      if (error instanceof Error && error.message.includes('User account not found')) {
        return createErrorResponse('USER_NOT_FOUND', error.message, undefined, 404, request).response;
      }
      return createErrorResponse('UPDATE_FAILED', 'Failed to update favorite stocks', undefined, 500, request).response;
    }
  }

  async deleteFavoriteStock(request: Request, symbol: string): Promise<Response> {
    const auth = await authenticateRequest(request, this.env.JWT_SECRET || '', this.env.JWT_REFRESH_SECRET);
    if (!auth) {
      return createErrorResponse('AUTH_MISSING_TOKEN', 'Authentication required', undefined, 401, request).response;
    }
    const username = auth.username;

    try {
      const deleted = await this.favoriteStocksService.deleteFavoriteStock(username, symbol);
      if (deleted) {
        return json({ success: true, message: 'Favorite stock removed' }, 200, request);
      } else {
        return createErrorResponse('NOT_FOUND', 'Favorite stock not found', undefined, 404, request).response;
      }
    } catch (error) {
      this.logger.error('Failed to delete favorite stock', error, { username, symbol });
      return createErrorResponse('DELETE_FAILED', 'Failed to delete favorite stock', undefined, 500, request).response;
    }
  }

  async getAllUsersFavoriteStocks(request: Request): Promise<Response> {
    const auth = await authenticateRequestWithAdmin(request, this.env, this.env.JWT_SECRET || '', this.env.JWT_REFRESH_SECRET);
    if (!auth) {
      return createErrorResponse('AUTH_MISSING_TOKEN', 'Authentication required', undefined, 401, request).response;
    }

    if (!auth.isAdmin) {
      return createErrorResponse('AUTH_FORBIDDEN', 'Admin access required', undefined, 403, request).response;
    }

    try {
      const users = await this.favoriteStocksService.getAllUsersFavoriteStocks();
      return json(AllUsersFavoriteStocksResponseSchema.parse({ users }), 200, request);
    } catch (error) {
      this.logger.error('Failed to get all users favorite stocks', error);
      return createErrorResponse('FETCH_FAILED', 'Failed to retrieve all users favorite stocks', undefined, 500, request).response;
    }
  }
}

