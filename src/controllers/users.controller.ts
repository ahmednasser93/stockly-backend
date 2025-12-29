/**
 * User Controller
 * Handles HTTP requests for user operations
 */

import type { UserService } from '../services/users.service';
import { json } from '../util';
import type { Logger } from '../logging/logger';
import { authenticateRequest } from '../auth/middleware';
import { createErrorResponse } from '../auth/error-handler';
import { UpdateUserProfileRequestSchema, validateRequest } from '@stockly/shared';
import type { Env } from '../index';

export class UserController {
  constructor(
    private userService: UserService,
    private logger: Logger,
    private env: Env
  ) {}

  /**
   * GET /v1/api/users/profile
   * Get current user's profile
   */
  async getProfile(request: Request): Promise<Response> {
    const auth = await authenticateRequest(
      request,
      this.env.JWT_SECRET || '',
      this.env.JWT_REFRESH_SECRET
    );

    if (!auth) {
      const { response } = createErrorResponse(
        'AUTH_MISSING_TOKEN',
        'Authentication required',
        undefined,
        undefined,
        request
      );
      return response;
    }

    try {
      // Get user by username (auth provides username, not userId)
      const user = await this.userService.getProfileByUsername(auth.username);
      if (!user) {
        return json({ error: 'User not found' }, 404, request);
      }

      return json({ user }, 200, request);
    } catch (error) {
      this.logger.error('Failed to get user profile', error);
      return json(
        { error: error instanceof Error ? error.message : 'Failed to get profile' },
        500,
        request
      );
    }
  }

  /**
   * PUT /v1/api/users/profile
   * Update current user's profile
   */
  async updateProfile(request: Request): Promise<Response> {
    const auth = await authenticateRequest(
      request,
      this.env.JWT_SECRET || '',
      this.env.JWT_REFRESH_SECRET
    );

    if (!auth) {
      const { response } = createErrorResponse(
        'AUTH_MISSING_TOKEN',
        'Authentication required',
        undefined,
        undefined,
        request
      );
      return response;
    }

    try {
      const body = await request.json();
      
      // Validate request using Zod schema from @stockly/shared
      const validatedData = validateRequest(UpdateUserProfileRequestSchema, body);

      // Get user by username to get userId
      const currentUser = await this.userService.getProfileByUsername(auth.username);
      if (!currentUser) {
        return json({ error: 'User not found' }, 404, request);
      }

      const user = await this.userService.updateProfile(currentUser.id, validatedData);
      return json({ user }, 200, request);
    } catch (error) {
      this.logger.error('Failed to update profile', error);
      
      // Handle validation errors
      if (error instanceof Error && error.name === 'ValidationError') {
        return json(
          { error: error.message || 'Validation failed' },
          400,
          request
        );
      }

      // Handle business logic errors (e.g., username taken)
      if (error instanceof Error && error.message === 'Username already taken') {
        return json({ error: 'Username already taken' }, 409, request);
      }

      return json(
        { error: error instanceof Error ? error.message : 'Update failed' },
        500,
        request
      );
    }
  }
}

