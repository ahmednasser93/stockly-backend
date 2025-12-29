import type { HistoricalService } from '../services/historical.service';
import { json } from '../util';
import type { Logger } from '../logging/logger';
import { createErrorResponse } from '../auth/error-handler';
import { HistoricalResponseSchema, HistoricalIntradayResponseSchema, GetHistoricalRequestSchema, GetHistoricalIntradayRequestSchema } from '@stockly/shared/schemas';
import type { Env } from '../index';

/**
 * Parse date string in YYYY-MM-DD format
 */
function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Format date as YYYY-MM-DD string
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export class HistoricalController {
  constructor(
    private historicalService: HistoricalService,
    private logger: Logger,
    private env: Env
  ) {}

  async getHistorical(request: Request, ctx?: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      
      // Validate request - return 400 if validation fails
      let validated;
      try {
        validated = GetHistoricalRequestSchema.parse(queryParams);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'Invalid request parameters';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const symbol = validated.symbol;
      const normalizedSymbol = symbol.trim().toUpperCase();

      // Parse date range parameters
      let fromDate: Date | null = null;
      let toDate: Date | null = null;
      let days: number | null = null;

      // Priority: from/to parameters take precedence over days
      if (validated.from || validated.to) {
        if (validated.from) {
          fromDate = parseDate(validated.from);
          if (!fromDate) {
            return createErrorResponse('INVALID_INPUT', "Invalid 'from' date format (expected YYYY-MM-DD)", undefined, 400, request).response;
          }
        }
        if (validated.to) {
          toDate = parseDate(validated.to);
          if (!toDate) {
            return createErrorResponse('INVALID_INPUT', "Invalid 'to' date format (expected YYYY-MM-DD)", undefined, 400, request).response;
          }
        }

        // Validate date range
        if (fromDate && toDate && fromDate > toDate) {
          return createErrorResponse('INVALID_INPUT', "'from' date must be before or equal to 'to' date", undefined, 400, request).response;
        }

        // Set defaults if only one date is provided
        if (!toDate) {
          toDate = new Date(); // Default to today
        }
        if (!fromDate) {
          // Default to 180 days ago if only 'to' is provided
          fromDate = new Date(toDate);
          fromDate.setDate(fromDate.getDate() - 180);
        }
      } else if (validated.days !== undefined) {
        // Use days parameter
        if (validated.days > 0 && validated.days <= 3650) {
          days = validated.days;
          toDate = new Date();
          fromDate = new Date(toDate);
          fromDate.setDate(fromDate.getDate() - days);
        } else {
          return createErrorResponse('INVALID_INPUT', 'days parameter must be a positive number between 1 and 3650', undefined, 400, request).response;
        }
      } else {
        // Default to 180 days if no parameters provided
        days = 180;
        toDate = new Date();
        fromDate = new Date(toDate);
        fromDate.setDate(fromDate.getDate() - days);
      }

      const data = await this.historicalService.getHistoricalPrices(normalizedSymbol, fromDate!, toDate!);

      return json(
        HistoricalResponseSchema.parse({
          symbol: normalizedSymbol,
          days: days ?? undefined,
          from: fromDate ? formatDate(fromDate) : undefined,
          to: toDate ? formatDate(toDate) : undefined,
          data,
        }),
        200,
        request
      );
    } catch (error) {
      this.logger.error('Failed to get historical prices', error);
      // Return empty array instead of 500 error for better UX
      const url = new URL(request.url);
      const symbol = url.searchParams.get('symbol') || '';
      return json(
        {
          symbol: symbol.trim().toUpperCase(),
          data: [],
        },
        200,
        request
      );
    }
  }

  async getHistoricalIntraday(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      const validated = GetHistoricalIntradayRequestSchema.parse({
        ...queryParams,
        interval: queryParams.interval || '4h',
        days: queryParams.days || '3',
      });

      const symbol = validated.symbol;
      const normalizedSymbol = symbol.trim().toUpperCase();
      const interval = validated.interval || '4h';
      const days = validated.days || 3;

      if (days <= 0 || days > 30) {
        return createErrorResponse('INVALID_INPUT', 'days parameter must be between 1 and 30', undefined, 400, request).response;
      }

      // Calculate date range
      const toDate = new Date();
      const fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - days);

      const fromDateStr = formatDate(fromDate);
      const toDateStr = formatDate(toDate);

      const data = await this.historicalService.getHistoricalIntraday(normalizedSymbol, interval, days);

      return json(
        HistoricalIntradayResponseSchema.parse({
          symbol: normalizedSymbol,
          interval,
          days,
          from: fromDateStr,
          to: toDateStr,
          data,
        }),
        200,
        request
      );
    } catch (error) {
      this.logger.error('Failed to get historical intraday data', error);
      if (error instanceof Error && error.message.includes('Invalid interval')) {
        return createErrorResponse('INVALID_INPUT', error.message, undefined, 400, request).response;
      }
      const url = new URL(request.url);
      const symbol = url.searchParams.get('symbol') || '';
      return json(
        {
          error: `Failed to fetch intraday data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          symbol: symbol.trim().toUpperCase(),
        },
        500,
        request
      );
    }
  }
}

