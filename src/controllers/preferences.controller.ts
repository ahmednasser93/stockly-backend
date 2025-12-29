/**
 * Preferences Controller
 * Handles HTTP requests for notification preferences operations
 */

import type { PreferencesService } from '../services/preferences.service';
import { json } from '../util';
import type { Logger } from '../logging/logger';
import { createErrorResponse } from '../auth/error-handler';
import { authenticateRequest } from '../auth/middleware';
import {
  UpdatePreferencesRequestSchema,
  NotificationPreferencesSchema,
  UpdatePreferencesResponseSchema,
} from '@stockly/shared/schemas';
import type { Env } from '../index';

export class PreferencesController {
  constructor(
    private preferencesService: PreferencesService,
    private logger: Logger,
    private env: Env
  ) {}

  /**
   * GET /v1/api/preferences
   * Get notification preferences for authenticated user
   */
  async getPreferences(request: Request): Promise<Response> {
    // Authenticate request
    const auth = await authenticateRequest(
      request,
      this.env.JWT_SECRET || '',
      this.env.JWT_REFRESH_SECRET
    );

    if (!auth) {
      return createErrorResponse(
        'AUTH_MISSING_TOKEN',
        'Authentication required',
        undefined,
        401,
        request
      ).response;
    }

    const username = auth.username;

    try {
      // Get user_id from username
      const user = await this.env.stockly
        .prepare('SELECT id FROM users WHERE username = ?')
        .bind(username)
        .first<{ id: string }>();

      if (!user) {
        return createErrorResponse(
          'USER_NOT_FOUND',
          'User not found',
          undefined,
          404,
          request
        ).response;
      }

      const preferences = await this.preferencesService.getPreferences(username, user.id);
      return json(NotificationPreferencesSchema.parse(preferences), 200, request);
    } catch (error) {
      this.logger.error('Failed to get preferences', error, { username });
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve preferences';
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, 500, request).response;
    }
  }

  /**
   * PUT /v1/api/preferences
   * Update notification preferences for authenticated user
   */
  async updatePreferences(request: Request): Promise<Response> {
    // Authenticate request
    const auth = await authenticateRequest(
      request,
      this.env.JWT_SECRET || '',
      this.env.JWT_REFRESH_SECRET
    );

    if (!auth) {
      return createErrorResponse(
        'AUTH_MISSING_TOKEN',
        'Authentication required',
        undefined,
        401,
        request
      ).response;
    }

    const username = auth.username;

    try {
      // Get user_id from username
      const user = await this.env.stockly
        .prepare('SELECT id FROM users WHERE username = ?')
        .bind(username)
        .first<{ id: string }>();

      if (!user) {
        return createErrorResponse(
          'USER_NOT_FOUND',
          'User not found',
          undefined,
          404,
          request
        ).response;
      }

      // Parse and validate request body
      const body = await request.json();
      const validated = UpdatePreferencesRequestSchema.parse(body);

      // Update preferences
      const updated = await this.preferencesService.updatePreferences(
        username,
        user.id,
        validated
      );

      return json(
        UpdatePreferencesResponseSchema.parse({
          success: true,
          message: 'Preferences updated',
        }),
        200,
        request
      );
    } catch (error) {
      this.logger.error('Failed to update preferences', error, { username });
      const errorMessage = error instanceof Error ? error.message : 'Failed to update preferences';
      const statusCode = errorMessage.includes('Invalid') || errorMessage.includes('must be') ? 400 : 500;
      return createErrorResponse('UPDATE_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }
}

