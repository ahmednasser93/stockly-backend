/**
 * Calendar Controller
 * Handles HTTP requests for calendar event endpoints
 */

import type { CalendarService } from '../services/calendar.service';
import type { Logger } from '../logging/logger';
import type { Env } from '../index';
import { json } from '../util';
import { createErrorResponse } from '../auth/error-handler';
import { CalendarEventResponseSchema, GetCalendarRequestSchema } from '@stockly/shared/schemas';

export class CalendarController {
  constructor(
    private calendarService: CalendarService,
    private logger: Logger,
    private env: Env
  ) {}

  /**
   * Get earnings calendar
   * GET /v1/api/calendar/earnings?from={date}&to={date}
   */
  async getEarningsCalendar(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      
      // Validate request
      let validated;
      try {
        validated = GetCalendarRequestSchema.parse(queryParams);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'Invalid parameters';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const from = validated.from;
      const to = validated.to;
      
      // Fetch data from service
      const data = await this.calendarService.getEarningsCalendar(from, to);
      
      // Validate and return response
      const responseData = CalendarEventResponseSchema.parse(data);
      return json(responseData, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      this.logger.error('Failed to get earnings calendar', error, { errorMessage });
      return createErrorResponse('FETCH_FAILED', `Failed to fetch earnings calendar: ${errorMessage}`, undefined, 500, request).response;
    }
  }

  /**
   * Get dividend calendar
   * GET /v1/api/calendar/dividends?from={date}&to={date}
   */
  async getDividendCalendar(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      
      // Validate request
      let validated;
      try {
        validated = GetCalendarRequestSchema.parse(queryParams);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'Invalid parameters';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const from = validated.from;
      const to = validated.to;
      
      // Fetch data from service
      const data = await this.calendarService.getDividendCalendar(from, to);
      
      // Validate and return response
      const responseData = CalendarEventResponseSchema.parse(data);
      return json(responseData, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      this.logger.error('Failed to get dividend calendar', error, { errorMessage });
      return createErrorResponse('FETCH_FAILED', `Failed to fetch dividend calendar: ${errorMessage}`, undefined, 500, request).response;
    }
  }

  /**
   * Get IPO calendar
   * GET /v1/api/calendar/ipos?from={date}&to={date}
   */
  async getIPOCalendar(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      
      // Validate request
      let validated;
      try {
        validated = GetCalendarRequestSchema.parse(queryParams);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'Invalid parameters';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const from = validated.from;
      const to = validated.to;
      
      // Fetch data from service
      const data = await this.calendarService.getIPOCalendar(from, to);
      
      // Validate and return response
      const responseData = CalendarEventResponseSchema.parse(data);
      return json(responseData, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      this.logger.error('Failed to get IPO calendar', error, { errorMessage });
      return createErrorResponse('FETCH_FAILED', `Failed to fetch IPO calendar: ${errorMessage}`, undefined, 500, request).response;
    }
  }

  /**
   * Get stock split calendar
   * GET /v1/api/calendar/splits?from={date}&to={date}
   */
  async getStockSplitCalendar(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      
      // Validate request
      let validated;
      try {
        validated = GetCalendarRequestSchema.parse(queryParams);
      } catch (validationError: any) {
        if (validationError?.issues) {
          const errorMessage = validationError.issues[0]?.message || 'Invalid parameters';
          return createErrorResponse('INVALID_INPUT', errorMessage, undefined, 400, request).response;
        }
        throw validationError;
      }

      const from = validated.from;
      const to = validated.to;
      
      // Fetch data from service
      const data = await this.calendarService.getStockSplitCalendar(from, to);
      
      // Validate and return response
      const responseData = CalendarEventResponseSchema.parse(data);
      return json(responseData, 200, request);
    } catch (error: any) {
      const errorMessage = error?.message || String(error) || 'Unknown error';
      this.logger.error('Failed to get stock split calendar', error, { errorMessage });
      return createErrorResponse('FETCH_FAILED', `Failed to fetch stock split calendar: ${errorMessage}`, undefined, 500, request).response;
    }
  }
}

