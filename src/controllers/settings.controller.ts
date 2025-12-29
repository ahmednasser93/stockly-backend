/**
 * Settings Controller
 * Handles HTTP requests for user settings operations
 */

import type { SettingsService } from '../services/settings.service';
import { json } from '../util';
import type { Logger } from '../logging/logger';
import { createErrorResponse } from '../auth/error-handler';
import { authenticateRequest } from '../auth/middleware';
import {
  UpdateSettingsRequestSchema,
  UserSettingsSchema,
  UpdateSettingsResponseSchema,
} from '@stockly/shared/schemas';
import type { Env } from '../index';

export class SettingsController {
  constructor(
    private settingsService: SettingsService,
    private logger: Logger,
    private env: Env
  ) {}

  /**
   * GET /v1/api/settings
   * Get user settings for authenticated user
   */
  async getSettings(request: Request): Promise<Response> {
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

      const settings = await this.settingsService.getSettings(username, user.id);
      return json(UserSettingsSchema.parse(settings), 200, request);
    } catch (error) {
      this.logger.error('Failed to get settings', error, { username });
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve settings';
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, 500, request).response;
    }
  }

  /**
   * PUT /v1/api/settings
   * Update user settings for authenticated user
   */
  async updateSettings(request: Request): Promise<Response> {
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
      const validated = UpdateSettingsRequestSchema.parse(body);

      // Update settings
      const updated = await this.settingsService.updateSettings(username, user.id, validated);

      // Check if this was a create or update
      const existing = await this.env.stockly
        .prepare('SELECT user_id FROM user_settings WHERE username = ?')
        .bind(username)
        .first();

      const statusCode = existing ? 200 : 201;
      const message = existing ? 'Settings updated' : 'Settings created';

      return json(
        UpdateSettingsResponseSchema.parse({
          success: true,
          message,
          settings: updated,
        }),
        statusCode,
        request
      );
    } catch (error) {
      this.logger.error('Failed to update settings', error, { username });
      const errorMessage = error instanceof Error ? error.message : 'Failed to update settings';
      const statusCode = errorMessage.includes('Invalid') || errorMessage.includes('must be') ? 400 : 500;
      return createErrorResponse('UPDATE_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }
}

