/**
 * News Controller
 * Handles HTTP requests for news operations
 */

import type { NewsService } from '../services/news.service';
import { json } from '../util';
import type { Logger } from '../logging/logger';
import { createErrorResponse } from '../auth/error-handler';
import { validateRequest } from '@stockly/shared';
import {
  GetNewsRequestSchema,
  GetGeneralNewsRequestSchema,
  GetStockNewsRequestSchema,
  NewsResponseSchema,
  GeneralNewsResponseSchema,
  StockNewsResponseSchema,
} from '@stockly/shared/schemas';
import type { Env } from '../index';
import { authenticateRequest } from '../auth/middleware';

export class NewsController {
  constructor(
    private newsService: NewsService,
    private logger: Logger,
    private env: Env
  ) {}

  /**
   * GET /v1/api/get-news?symbol=AAPL or ?symbols=AAPL,MSFT
   * Get news for stock symbols with optional pagination
   */
  async getNews(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const symbol = url.searchParams.get('symbol');
      const symbols = url.searchParams.get('symbols');

      // Build request object for validation
      const requestData: any = {};
      if (symbol) requestData.symbol = symbol;
      if (symbols) requestData.symbols = symbols;
      if (url.searchParams.get('from')) requestData.from = url.searchParams.get('from');
      if (url.searchParams.get('to')) requestData.to = url.searchParams.get('to');
      if (url.searchParams.get('page')) requestData.page = parseInt(url.searchParams.get('page') || '0', 10);
      if (url.searchParams.get('limit')) requestData.limit = parseInt(url.searchParams.get('limit') || '20', 10);

      // Validate request
      const validated = GetNewsRequestSchema.parse(requestData);

      // Parse symbols
      let symbolList: string[];
      if (validated.symbols) {
        symbolList = validated.symbols.split(',').map(s => s.trim());
      } else if (validated.symbol) {
        symbolList = [validated.symbol];
      } else {
        return createErrorResponse('INVALID_INPUT', 'symbol or symbols parameter required', undefined, 400, request).response;
      }

      // Build options
      const options: any = {};
      if (validated.from) options.from = validated.from;
      if (validated.to) options.to = validated.to;
      if (validated.page !== undefined) options.page = validated.page;
      if (validated.limit !== undefined) options.limit = validated.limit;

      // Get news
      const result = await this.newsService.getNews(symbolList, options);

      // Build response
      const response = {
        symbols: symbolList,
        news: result.news,
        pagination: result.pagination,
      };

      return json(NewsResponseSchema.parse(response), 200, request);
    } catch (error) {
      this.logger.error('Failed to get news', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve news';
      const statusCode = errorMessage.includes('Invalid') || errorMessage.includes('Maximum') ? 400 : 500;
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }

  /**
   * GET /v1/api/news/general?page=0&limit=20
   * Get general market news
   */
  async getGeneralNews(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const requestData: any = {};
      if (url.searchParams.get('page')) requestData.page = parseInt(url.searchParams.get('page') || '0', 10);
      if (url.searchParams.get('limit')) requestData.limit = parseInt(url.searchParams.get('limit') || '20', 10);

      // Validate request
      const validated = GetGeneralNewsRequestSchema.parse(requestData);

      // Build options
      const options: any = {};
      if (validated.page !== undefined) options.page = validated.page;
      if (validated.limit !== undefined) options.limit = validated.limit;

      // Get general news
      const result = await this.newsService.getGeneralNews(options);

      // Build response
      const response = {
        news: result.news,
        pagination: result.pagination,
      };

      return json(GeneralNewsResponseSchema.parse(response), 200, request);
    } catch (error) {
      this.logger.error('Failed to get general news', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve general news';
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, 500, request).response;
    }
  }

  /**
   * GET /v1/api/get-stock-news?symbol=AAPL
   * Get news for a single stock symbol (simplified endpoint)
   */
  async getStockNews(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const symbol = url.searchParams.get('symbol');

      if (!symbol) {
        return createErrorResponse('INVALID_INPUT', 'symbol parameter required', undefined, 400, request).response;
      }

      // Validate request
      const validated = GetStockNewsRequestSchema.parse({ symbol });

      // Get stock news
      const result = await this.newsService.getStockNews(validated.symbol);

      // Build response
      const response = {
        symbol: validated.symbol,
        news: result.news,
      };

      return json(StockNewsResponseSchema.parse(response), 200, request);
    } catch (error) {
      this.logger.error('Failed to get stock news', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve stock news';
      const statusCode = errorMessage.includes('Invalid') ? 400 : 500;
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }

  /**
   * GET /v1/api/news/favorites?page=0&limit=20
   * Get news for user's favorite symbols (requires authentication)
   */
  async getFavoriteNews(request: Request): Promise<Response> {
    try {
      // Authenticate request to get userId
      const auth = await authenticateRequest(
        request,
        this.env.JWT_SECRET || "",
        this.env.JWT_REFRESH_SECRET
      );

      if (!auth) {
        return createErrorResponse(
          "AUTH_MISSING_TOKEN",
          "Authentication required",
          undefined,
          401,
          request
        ).response;
      }

      const username = auth.username;

      this.logger.info("Fetching favorite news", { username });

      // Fetch user preferences (by username)
      const row = await this.env.stockly
        .prepare(`SELECT news_favorite_symbols FROM user_settings WHERE username = ?`)
        .bind(username)
        .first<{ news_favorite_symbols: string }>();

      let symbols: string[] = [];
      if (row && row.news_favorite_symbols) {
        try {
          symbols = JSON.parse(row.news_favorite_symbols);
        } catch (e) {
          this.logger.warn("Failed to parse news_favorite_symbols", { username, error: e });
        }
      }

      if (symbols.length === 0) {
        this.logger.info("No favorite symbols selected", { username });
        return json({ 
          news: [], 
          pagination: { page: 0, limit: 20, total: 0, hasMore: false },
          message: "No favorite symbols selected" 
        }, 200, request);
      }

      this.logger.info("Favorite symbols found", { username, symbolCount: symbols.length, symbols });

      // Get pagination params from URL
      const url = new URL(request.url);
      const requestData: any = { symbols: symbols.join(",") };
      if (url.searchParams.get('from')) requestData.from = url.searchParams.get('from');
      if (url.searchParams.get('to')) requestData.to = url.searchParams.get('to');
      if (url.searchParams.get('page')) requestData.page = parseInt(url.searchParams.get('page') || '0', 10);
      if (url.searchParams.get('limit')) requestData.limit = parseInt(url.searchParams.get('limit') || '20', 10);

      // Validate request
      const validated = GetNewsRequestSchema.parse(requestData);

      // Parse symbols
      const symbolList = validated.symbols.split(',').map(s => s.trim());

      // Build options
      const options: any = {};
      if (validated.from) options.from = validated.from;
      if (validated.to) options.to = validated.to;
      if (validated.page !== undefined) options.page = validated.page;
      if (validated.limit !== undefined) options.limit = validated.limit;

      // Get news
      const result = await this.newsService.getNews(symbolList, options);

      // Build response
      const response = {
        symbols: symbolList,
        news: result.news,
        pagination: result.pagination,
      };

      return json(NewsResponseSchema.parse(response), 200, request);
    } catch (error) {
      this.logger.error("Failed to fetch favorite news", error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch favorite news';
      const statusCode = errorMessage.includes('Invalid') || errorMessage.includes('Authentication') ? 400 : 500;
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }
}

