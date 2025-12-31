import type { QuotesService } from '../services/quotes.service';
import { json } from '../util';
import type { Logger } from '../logging/logger';
import { createErrorResponse } from '../auth/error-handler';
import { QuoteResponseSchema, QuotesResponseSchema, GetStockRequestSchema, GetStocksRequestSchema } from '@stockly/shared/schemas';
import type { Env } from '../index';
import { getConfig } from '../api/config';
import { fetchAndSaveHistoricalPrice } from '../api/historical-prices';
import { sendFCMNotification } from '../notifications/fcm-sender';
import { getCacheIfValid } from '../api/cache';
import type { IDatabase } from '../infrastructure/database/IDatabase';
import { MarketCacheRefreshService } from '../services/market-cache-refresh.service';

type QuotesRepositoryWithStale = {
  getStaleQuote(symbol: string): Promise<any>;
};

async function handleProviderFailure(
  symbol: string,
  db: IDatabase,
  ctx: ExecutionContext | undefined,
  failureReason: string,
  logger: Logger,
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const dbRecord = await db
      .prepare(
        `SELECT symbol, price, day_low, day_high, volume, timestamp
         FROM stock_prices
         WHERE symbol = ?
         ORDER BY timestamp DESC
         LIMIT 1`
      )
      .bind(symbol)
      .first<{
        symbol: string;
        price: number | null;
        day_low: number | null;
        day_high: number | null;
        volume: number | null;
        timestamp: number;
      }>();

    if (dbRecord) {
      if (ctx) {
        ctx.waitUntil(notifyUsersOfProviderFailure(symbol, env, logger));
      }

      const staleResponse = {
        stale: true,
        stale_reason: failureReason,
        symbol: dbRecord.symbol,
        price: dbRecord.price,
        dayLow: dbRecord.day_low,
        dayHigh: dbRecord.day_high,
        volume: dbRecord.volume,
        lastUpdatedAt: new Date(dbRecord.timestamp * 1000).toISOString(),
        timestamp: dbRecord.timestamp,
      };

      return json(staleResponse, 200, request);
    } else {
      return json({ error: 'no_price_available' }, 404, request);
    }
  } catch (dbError) {
    logger.error('Failed to fetch from DB during provider failure', dbError);
    return json({ error: 'no_price_available' }, 500, request);
  }
}

async function notifyUsersOfProviderFailure(symbol: string, env: Env, logger: Logger): Promise<void> {
  try {
    const { isThrottled, markThrottled } = await import('../api/throttle-cache');
    const throttleKey = `provider_failure:${symbol}:notification_sent`;

    if (isThrottled(throttleKey)) {
      return;
    }

    markThrottled(throttleKey);

    const rows = await env.stockly
      .prepare(
        `SELECT d.user_id, dpt.push_token 
         FROM device_push_tokens dpt
         INNER JOIN devices d ON dpt.device_id = d.id
         WHERE d.is_active = 1 AND dpt.push_token IS NOT NULL`
      )
      .all<{ user_id: string; push_token: string }>();

    const tokens = (rows.results || []).map((r) => r.push_token).filter(Boolean);

    if (tokens.length > 0) {
      await sendFCMNotification(
        tokens,
        {
          title: 'Provider Service Issue',
          body: `Unable to fetch latest price for ${symbol}. Showing cached data.`,
        },
        env,
        logger
      );
    }
  } catch (error) {
    logger.error('Failed to notify users of provider failure', error);
  }
}

export class QuotesController {
  constructor(
    private quotesService: QuotesService,
    private logger: Logger,
    private env: Env,
    private db: IDatabase
  ) {
    // db is passed separately but we also have env.stockly
    // Make sure db matches env.stockly if not explicitly provided
  }

  async getStock(request: Request, ctx?: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      
      // Validate request - return 400 if validation fails
      let validated;
      try {
        validated = GetStockRequestSchema.parse(queryParams);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'symbol is required';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const symbol = validated.symbol;
      const normalizedSymbol = symbol.trim().toUpperCase();
      const cacheKey = `quote:${normalizedSymbol}`;

      const config = await getConfig(this.env);
      const pollingIntervalSec = config.pollingIntervalSec;

      // Check cache
      const cachedEntry = getCacheIfValid(cacheKey, pollingIntervalSec);
      if (cachedEntry) {
        this.logger.info(`Cache hit for ${normalizedSymbol}`, {
          ageSeconds: Math.floor((Date.now() - cachedEntry.cachedAt) / 1000),
          pollingIntervalSec,
          cacheStatus: 'HIT',
        });
        return json(cachedEntry.data, 200, request);
      }

      // Check simulation mode
      if (config.featureFlags.simulateProviderFailure) {
        const dbRecord = await this.db
          .prepare(
            `SELECT symbol, price, day_low, day_high, volume, timestamp
             FROM stock_prices
             WHERE symbol = ?
             ORDER BY timestamp DESC
             LIMIT 1`
          )
          .bind(normalizedSymbol)
          .first<{
            symbol: string;
            price: number | null;
            day_low: number | null;
            day_high: number | null;
            volume: number | null;
            timestamp: number;
          }>();

        if (dbRecord) {
          return json(
            {
              simulationActive: true,
              stale: true,
              stale_reason: 'simulation_mode',
              symbol: dbRecord.symbol,
              price: dbRecord.price,
              dayLow: dbRecord.day_low,
              dayHigh: dbRecord.day_high,
              volume: dbRecord.volume,
              lastUpdatedAt: new Date(dbRecord.timestamp * 1000).toISOString(),
              timestamp: dbRecord.timestamp,
            },
            200,
            request
          );
        } else {
          return json({ error: 'no_price_available' }, 404, request);
        }
      }

      // Fetch quote
      const quote = await this.quotesService.getQuote(normalizedSymbol);

      // Save historical in background
      if (ctx && normalizedSymbol) {
        ctx.waitUntil(fetchAndSaveHistoricalPrice(normalizedSymbol, this.env, ctx));
      }

      return json(QuoteResponseSchema.parse(quote), 200, request);
    } catch (error) {
      this.logger.error('Failed to get stock quote', error);
      const url = new URL(request.url);
      const symbol = url.searchParams.get('symbol') || '';

      if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('timeout'))) {
        return handleProviderFailure(symbol.trim().toUpperCase(), this.db, undefined, 'provider_network_error', this.logger, request, this.env);
      }

      try {
        return handleProviderFailure(symbol.trim().toUpperCase(), this.db, undefined, 'provider_unknown_error', this.logger, request, this.env);
      } catch (fallbackErr) {
        this.logger.error('Both provider and DB fallback failed', fallbackErr);
        return json({ error: 'failed to fetch stock' }, 500, request);
      }
    }
  }

  async getStocks(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      
      // Validate request - return 400 if validation fails
      let validated;
      try {
        validated = GetStocksRequestSchema.parse(queryParams);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'symbols is required';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const symbols = validated.symbols.split(',').filter((s) => s.trim().length > 0);
      if (symbols.length === 0) {
        return createErrorResponse('INVALID_INPUT', 'symbols required', undefined, 400, request).response;
      }

      const quotes = await this.quotesService.getQuotes(symbols);
      
      // Step 3: Update market cache if stocks exist (side effect, non-blocking)
      // This handles favorite stocks refresh case - updates market cache if any of these stocks are in the cache
      if (quotes.length > 0) {
        const updatedStocks = quotes
          .filter((quote) => quote.price !== null && quote.price !== undefined)
          .map((quote) => ({
            symbol: quote.symbol,
            price: quote.price!,
            change: quote.change ?? null,
            changePercent: quote.changePercent ?? null,
            volume: quote.volume ?? null,
          }));
        
        if (updatedStocks.length > 0) {
          const cacheRefreshService = new MarketCacheRefreshService(this.env, this.logger);
          // Fire and forget - don't wait for completion
          cacheRefreshService.refreshMarketCacheOnPriceUpdate(updatedStocks).catch((error) => {
            this.logger.warn('Market cache refresh failed (non-blocking)', error);
          });
        }
      }
      
      // Step 4: Return response
      // Return empty array if no quotes found (better UX than error)
      if (quotes.length === 0) {
        return json([], 200, request);
      }
      
      return json(QuotesResponseSchema.parse(quotes), 200, request);
    } catch (error) {
      this.logger.error('Failed to get stock quotes', error);
      
      // Check if it's a validation error
      if (error instanceof Error && error.message.includes('Invalid')) {
        return createErrorResponse('INVALID_INPUT', error.message, undefined, 400, request).response;
      }
      
      // If service throws error about empty symbols, return empty array
      if (error instanceof Error && error.message.includes('Invalid symbols format')) {
        return json([], 200, request);
      }
      
      return createErrorResponse('FETCH_FAILED', 'Failed to fetch stocks', undefined, 500, request).response;
    }
  }
}

