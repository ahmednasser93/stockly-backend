/**
 * Alert Controller
 * Handles HTTP requests for alert operations
 */

import type { AlertService } from '../services/alerts.service';
import { json } from '../util';
import type { Logger } from '../logging/logger';
import { authenticateRequestWithAdmin } from '../auth/middleware';
import { createErrorResponse } from '../auth/error-handler';
import { validateRequest } from '@stockly/shared';
import { CreateAlertRequestSchema, UpdateAlertRequestSchema, ListAlertsResponseSchema, AlertResponseSchema } from '@stockly/shared/schemas';
import type { Env } from '../index';
import type { CreateAlertRequest, UpdateAlertRequest } from '@stockly/shared/types';

export class AlertController {
  constructor(
    private alertService: AlertService,
    private logger: Logger,
    private env: Env
  ) {}

  /**
   * GET /v1/api/alerts
   * List all alerts for the authenticated user (or all alerts for admin)
   */
  async listAlerts(request: Request): Promise<Response> {
    const auth = await authenticateRequestWithAdmin(
      request,
      this.env,
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
      // For admin, pass null to get all data; otherwise use username
      const username = auth.isAdmin ? null : auth.username;
      const alerts = await this.alertService.listAlerts(username);
      return json(ListAlertsResponseSchema.parse({ alerts }), 200, request);
    } catch (error) {
      this.logger.error('Failed to list alerts', error);
      return createErrorResponse('INTERNAL_ERROR', 'Failed to retrieve alerts', undefined, 500, request).response;
    }
  }

  /**
   * GET /v1/api/alerts/:id
   * Get a specific alert by ID
   */
  async getAlert(request: Request, id: string): Promise<Response> {
    const auth = await authenticateRequestWithAdmin(
      request,
      this.env,
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
      const username = auth.isAdmin ? null : auth.username;
      const alert = await this.alertService.getAlert(id, username);
      if (!alert) {
        return createErrorResponse('ALERT_NOT_FOUND', 'Alert not found', undefined, 404, request).response;
      }
      return json(AlertResponseSchema.parse({ alert }), 200, request);
    } catch (error) {
      this.logger.error('Failed to get alert', error, { id });
      return createErrorResponse('INTERNAL_ERROR', 'Failed to retrieve alert', undefined, 500, request).response;
    }
  }

  /**
   * POST /v1/api/alerts
   * Create a new alert
   */
  async createAlert(request: Request): Promise<Response> {
    const auth = await authenticateRequestWithAdmin(
      request,
      this.env,
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

    let validatedBody: CreateAlertRequest;
    try {
      const body = await request.json();
      validatedBody = validateRequest(CreateAlertRequestSchema, body);
    } catch (error) {
      this.logger.warn('Invalid request body for createAlert', error);
      return createErrorResponse('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid request body', undefined, undefined, request).response;
    }

    try {
      // Always use auth.username for alert creation (both admin and regular users)
      const alertUsername = auth.username;
      if (!alertUsername) {
        return createErrorResponse('INVALID_INPUT', 'Username is required to create alerts', undefined, 400, request).response;
      }

      const alert = await this.alertService.createAlert(validatedBody, alertUsername);
      return json(AlertResponseSchema.parse({ alert }), 201, request);
    } catch (error) {
      this.logger.error('Failed to create alert', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create alert';
      return createErrorResponse('CREATE_FAILED', errorMessage, undefined, 400, request).response;
    }
  }

  /**
   * PUT /v1/api/alerts/:id
   * Update an existing alert
   */
  async updateAlert(request: Request, id: string): Promise<Response> {
    const auth = await authenticateRequestWithAdmin(
      request,
      this.env,
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

    let validatedBody: UpdateAlertRequest;
    try {
      const body = await request.json();
      validatedBody = validateRequest(UpdateAlertRequestSchema, body);
    } catch (error) {
      this.logger.warn('Invalid request body for updateAlert', error);
      return createErrorResponse('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid request body', undefined, undefined, request).response;
    }

    try {
      const username = auth.isAdmin ? null : auth.username;
      const alert = await this.alertService.updateAlert(id, validatedBody, username);
      return json(AlertResponseSchema.parse({ alert }), 200, request);
    } catch (error) {
      this.logger.error('Failed to update alert', error, { id });
      const errorMessage = error instanceof Error ? error.message : 'Failed to update alert';
      const statusCode = errorMessage === 'Alert not found' ? 404 : 400;
      return createErrorResponse('UPDATE_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }

  /**
   * DELETE /v1/api/alerts/:id
   * Delete an alert
   */
  async deleteAlert(request: Request, id: string): Promise<Response> {
    const auth = await authenticateRequestWithAdmin(
      request,
      this.env,
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
      const username = auth.isAdmin ? null : auth.username;
      await this.alertService.deleteAlert(id, username);
      return json({ success: true }, 200, request);
    } catch (error) {
      this.logger.error('Failed to delete alert', error, { id });
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete alert';
      const statusCode = errorMessage === 'Alert not found' ? 404 : 400;
      return createErrorResponse('DELETE_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }
}

