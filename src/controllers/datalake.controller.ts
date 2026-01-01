/**
 * Datalake Controller
 * Handles HTTP requests for datalake management operations
 * Note: These endpoints require user authentication (JWT)
 */

import type { DatalakeService } from '../services/datalake.service';
import { json } from '../util';
import type { Logger } from '../logging/logger';
import { createErrorResponse } from '../auth/error-handler';
import { authenticateRequest } from '../auth/middleware';
import type { Env } from '../index';

export class DatalakeController {
  constructor(
    private datalakeService: DatalakeService,
    private logger: Logger,
    private env: Env
  ) {}

  /**
   * Helper to authenticate user request
   */
  private async authenticateUser(request: Request): Promise<{ username: string } | null> {
    const auth = await authenticateRequest(
      request,
      this.env.JWT_SECRET || '',
      this.env.JWT_REFRESH_SECRET
    );
    return auth ? { username: auth.username } : null;
  }

  /**
   * GET /v1/api/admin/datalakes
   * List all datalakes
   */
  async getAllDatalakes(request: Request): Promise<Response> {
    try {
      // Authenticate user
      const auth = await this.authenticateUser(request);
      if (!auth) {
        return createErrorResponse('AUTH_MISSING_TOKEN', 'Authentication required', undefined, 401, request).response;
      }

      const datalakes = await this.datalakeService.getAllDatalakes();
      return json(datalakes, 200, request);
    } catch (error) {
      this.logger.error('Failed to get all datalakes', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve datalakes';
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, 500, request).response;
    }
  }

  /**
   * POST /v1/api/admin/datalakes
   * Create a new datalake
   */
  async createDatalake(request: Request): Promise<Response> {
    try {
      // Authenticate user
      const auth = await this.authenticateUser(request);
      if (!auth) {
        return createErrorResponse('AUTH_MISSING_TOKEN', 'Authentication required', undefined, 401, request).response;
      }

      const body = await request.json();
      const datalake = await this.datalakeService.createDatalake(body);
      return json(datalake, 201, request);
    } catch (error) {
      this.logger.error('Failed to create datalake', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create datalake';
      const statusCode = errorMessage.includes('required') || errorMessage.includes('Invalid') || errorMessage.includes('already exists') ? 400 : 500;
      return createErrorResponse('CREATE_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }

  /**
   * GET /v1/api/admin/datalakes/:id
   * Get datalake by ID
   */
  async getDatalake(request: Request, id: string): Promise<Response> {
    try {
      // Authenticate user
      const auth = await this.authenticateUser(request);
      if (!auth) {
        return createErrorResponse('AUTH_MISSING_TOKEN', 'Authentication required', undefined, 401, request).response;
      }

      const datalake = await this.datalakeService.getDatalake(id);
      if (!datalake) {
        return createErrorResponse('NOT_FOUND', 'Datalake not found', undefined, 404, request).response;
      }
      return json(datalake, 200, request);
    } catch (error) {
      this.logger.error('Failed to get datalake', error, { id });
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve datalake';
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, 500, request).response;
    }
  }

  /**
   * PUT /v1/api/admin/datalakes/:id
   * Update a datalake
   */
  async updateDatalake(request: Request, id: string): Promise<Response> {
    try {
      // Authenticate user
      const auth = await this.authenticateUser(request);
      if (!auth) {
        return createErrorResponse('AUTH_MISSING_TOKEN', 'Authentication required', undefined, 401, request).response;
      }

      const body = await request.json();
      const datalake = await this.datalakeService.updateDatalake(id, body);
      return json(datalake, 200, request);
    } catch (error) {
      this.logger.error('Failed to update datalake', error, { id });
      const errorMessage = error instanceof Error ? error.message : 'Failed to update datalake';
      const statusCode = errorMessage.includes('not found') ? 404 : 
                        errorMessage.includes('required') || errorMessage.includes('Invalid') || errorMessage.includes('already exists') ? 400 : 500;
      return createErrorResponse('UPDATE_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }

  /**
   * DELETE /v1/api/admin/datalakes/:id
   * Delete a datalake
   */
  async deleteDatalake(request: Request, id: string): Promise<Response> {
    try {
      // Authenticate user
      const auth = await this.authenticateUser(request);
      if (!auth) {
        return createErrorResponse('AUTH_MISSING_TOKEN', 'Authentication required', undefined, 401, request).response;
      }

      await this.datalakeService.deleteDatalake(id);
      return json({ success: true }, 200, request);
    } catch (error) {
      this.logger.error('Failed to delete datalake', error, { id });
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete datalake';
      const statusCode = errorMessage.includes('not found') ? 404 : 
                        errorMessage.includes('Cannot delete') ? 400 : 500;
      return createErrorResponse('DELETE_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }

  /**
   * GET /v1/api/admin/api-endpoints
   * List all API endpoints
   */
  async getAllApiEndpoints(request: Request): Promise<Response> {
    try {
      // Authenticate user
      const auth = await this.authenticateUser(request);
      if (!auth) {
        return createErrorResponse('AUTH_MISSING_TOKEN', 'Authentication required', undefined, 401, request).response;
      }

      const endpoints = await this.datalakeService.getAllApiEndpoints();
      return json(endpoints, 200, request);
    } catch (error) {
      this.logger.error('Failed to get all API endpoints', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve API endpoints';
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, 500, request).response;
    }
  }

  /**
   * GET /v1/api/admin/api-endpoints/:id/mappings
   * Get mappings for an API endpoint
   */
  async getEndpointMappings(request: Request, endpointId: string): Promise<Response> {
    try {
      // Authenticate user
      const auth = await this.authenticateUser(request);
      if (!auth) {
        return createErrorResponse('AUTH_MISSING_TOKEN', 'Authentication required', undefined, 401, request).response;
      }

      // Get all datalakes
      const datalakes = await this.datalakeService.getAllDatalakes();
      
      // Get mappings for this endpoint
      const mappings: Array<{ datalake: any; isSelected: boolean }> = [];
      for (const datalake of datalakes) {
        const mappingsForDatalake = await this.datalakeService.getEndpointMappingsForDatalake(datalake.id);
        const mapping = mappingsForDatalake.find(m => m.apiEndpointId === endpointId);
        if (mapping) {
          mappings.push({
            datalake,
            isSelected: mapping.isSelected,
          });
        }
      }

      return json(mappings, 200, request);
    } catch (error) {
      this.logger.error('Failed to get endpoint mappings', error, { endpointId });
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve endpoint mappings';
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, 500, request).response;
    }
  }

  /**
   * PUT /v1/api/admin/api-endpoints/:id/select-datalake
   * Select datalake for an endpoint
   */
  async selectDatalakeForEndpoint(request: Request, endpointId: string): Promise<Response> {
    try {
      // Authenticate user
      const auth = await this.authenticateUser(request);
      if (!auth) {
        return createErrorResponse('AUTH_MISSING_TOKEN', 'Authentication required', undefined, 401, request).response;
      }

      const body = await request.json();
      const { datalakeId } = body;

      if (!datalakeId) {
        return createErrorResponse('INVALID_INPUT', 'datalakeId is required', undefined, 400, request).response;
      }

      await this.datalakeService.setSelectedDatalakeForEndpoint(endpointId, datalakeId);
      return json({ success: true }, 200, request);
    } catch (error) {
      this.logger.error('Failed to select datalake for endpoint', error, { endpointId });
      const errorMessage = error instanceof Error ? error.message : 'Failed to select datalake for endpoint';
      const statusCode = errorMessage.includes('not found') ? 404 : 
                        errorMessage.includes('required') ? 400 : 
                        errorMessage.includes('inactive') ? 400 : 500;
      return createErrorResponse('UPDATE_FAILED', errorMessage, undefined, statusCode, request).response;
    }
  }

  /**
   * GET /v1/api/admin/datalakes/:id/mappings
   * Get all endpoint mappings for a datalake
   */
  async getDatalakeMappings(request: Request, datalakeId: string): Promise<Response> {
    try {
      // Authenticate user
      const auth = await this.authenticateUser(request);
      if (!auth) {
        return createErrorResponse('AUTH_MISSING_TOKEN', 'Authentication required', undefined, 401, request).response;
      }

      const mappings = await this.datalakeService.getEndpointMappingsForDatalake(datalakeId);
      
      // Enrich with endpoint information
      const enrichedMappings = await Promise.all(
        mappings.map(async (mapping) => {
          const endpoint = await this.datalakeService.getApiEndpoint(mapping.apiEndpointId);
          return {
            ...mapping,
            endpoint: endpoint || null,
          };
        })
      );

      return json(enrichedMappings, 200, request);
    } catch (error) {
      this.logger.error('Failed to get datalake mappings', error, { datalakeId });
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve datalake mappings';
      return createErrorResponse('FETCH_FAILED', errorMessage, undefined, 500, request).response;
    }
  }
}

