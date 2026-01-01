/**
 * Datalake Service
 * Contains business logic for datalake operations
 */

import type { IDatalakeRepository, Datalake, ApiEndpoint, DatalakeApiMapping, CreateDatalakeInput, UpdateDatalakeInput } from '../repositories/interfaces/IDatalakeRepository';
import type { Logger } from '../logging/logger';

export class DatalakeService {
  constructor(
    private datalakeRepo: IDatalakeRepository,
    private logger?: Logger
  ) {}

  /**
   * Get datalake by ID
   */
  async getDatalake(id: string): Promise<Datalake | null> {
    if (!id || id.trim().length === 0) {
      throw new Error('Datalake ID is required');
    }

    return this.datalakeRepo.getDatalake(id);
  }

  /**
   * Get all datalakes
   */
  async getAllDatalakes(): Promise<Datalake[]> {
    return this.datalakeRepo.getAllDatalakes();
  }

  /**
   * Create a new datalake
   */
  async createDatalake(input: CreateDatalakeInput): Promise<Datalake> {
    // Validate input
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('Datalake name is required');
    }

    if (!input.baseUrl || input.baseUrl.trim().length === 0) {
      throw new Error('Base URL is required');
    }

    // Validate URL format
    try {
      new URL(input.baseUrl);
    } catch {
      throw new Error('Invalid base URL format');
    }

    // Validate auth type
    if (input.authType && !['query_param', 'header', 'none'].includes(input.authType)) {
      throw new Error('Invalid auth type. Must be query_param, header, or none');
    }

    // Check if name already exists
    const existingDatalakes = await this.datalakeRepo.getAllDatalakes();
    const nameExists = existingDatalakes.some(d => d.name.toLowerCase() === input.name.toLowerCase());
    if (nameExists) {
      throw new Error('Datalake with this name already exists');
    }

    return this.datalakeRepo.createDatalake(input);
  }

  /**
   * Update an existing datalake
   */
  async updateDatalake(id: string, updates: UpdateDatalakeInput): Promise<Datalake> {
    if (!id || id.trim().length === 0) {
      throw new Error('Datalake ID is required');
    }

    // Check if datalake exists
    const existing = await this.datalakeRepo.getDatalake(id);
    if (!existing) {
      throw new Error('Datalake not found');
    }

    // Validate base URL if provided
    if (updates.baseUrl) {
      try {
        new URL(updates.baseUrl);
      } catch {
        throw new Error('Invalid base URL format');
      }
    }

    // Validate auth type if provided
    if (updates.authType && !['query_param', 'header', 'none'].includes(updates.authType)) {
      throw new Error('Invalid auth type. Must be query_param, header, or none');
    }

    // Check name uniqueness if name is being updated
    if (updates.name && updates.name !== existing.name) {
      const existingDatalakes = await this.datalakeRepo.getAllDatalakes();
      const nameExists = existingDatalakes.some(d => d.id !== id && d.name.toLowerCase() === updates.name!.toLowerCase());
      if (nameExists) {
        throw new Error('Datalake with this name already exists');
      }
    }

    return this.datalakeRepo.updateDatalake(id, updates);
  }

  /**
   * Delete a datalake
   */
  async deleteDatalake(id: string): Promise<void> {
    if (!id || id.trim().length === 0) {
      throw new Error('Datalake ID is required');
    }

    // Check if datalake exists
    const existing = await this.datalakeRepo.getDatalake(id);
    if (!existing) {
      throw new Error('Datalake not found');
    }

    // Prevent deletion of default FMP datalake
    if (id === 'fmp-default') {
      throw new Error('Cannot delete default FMP datalake');
    }

    await this.datalakeRepo.deleteDatalake(id);
  }

  /**
   * Get API endpoint by ID
   */
  async getApiEndpoint(id: string): Promise<ApiEndpoint | null> {
    if (!id || id.trim().length === 0) {
      throw new Error('API endpoint ID is required');
    }

    return this.datalakeRepo.getApiEndpoint(id);
  }

  /**
   * Get all API endpoints
   */
  async getAllApiEndpoints(): Promise<ApiEndpoint[]> {
    return this.datalakeRepo.getAllApiEndpoints();
  }

  /**
   * Get selected datalake for a specific API endpoint
   */
  async getSelectedDatalakeForEndpoint(endpointId: string): Promise<Datalake | null> {
    if (!endpointId || endpointId.trim().length === 0) {
      throw new Error('API endpoint ID is required');
    }

    // Check if endpoint exists
    const endpoint = await this.datalakeRepo.getApiEndpoint(endpointId);
    if (!endpoint) {
      throw new Error('API endpoint not found');
    }

    return this.datalakeRepo.getSelectedDatalakeForEndpoint(endpointId);
  }

  /**
   * Set selected datalake for an API endpoint
   */
  async setSelectedDatalakeForEndpoint(endpointId: string, datalakeId: string): Promise<void> {
    if (!endpointId || endpointId.trim().length === 0) {
      throw new Error('API endpoint ID is required');
    }

    if (!datalakeId || datalakeId.trim().length === 0) {
      throw new Error('Datalake ID is required');
    }

    // Check if endpoint exists
    const endpoint = await this.datalakeRepo.getApiEndpoint(endpointId);
    if (!endpoint) {
      throw new Error('API endpoint not found');
    }

    // Check if datalake exists
    const datalake = await this.datalakeRepo.getDatalake(datalakeId);
    if (!datalake) {
      throw new Error('Datalake not found');
    }

    // Check if datalake is active
    if (!datalake.isActive) {
      throw new Error('Cannot select inactive datalake');
    }

    await this.datalakeRepo.setSelectedDatalakeForEndpoint(endpointId, datalakeId);
  }

  /**
   * Get all endpoint mappings for a datalake
   */
  async getEndpointMappingsForDatalake(datalakeId: string): Promise<DatalakeApiMapping[]> {
    if (!datalakeId || datalakeId.trim().length === 0) {
      throw new Error('Datalake ID is required');
    }

    // Check if datalake exists
    const datalake = await this.datalakeRepo.getDatalake(datalakeId);
    if (!datalake) {
      throw new Error('Datalake not found');
    }

    return this.datalakeRepo.getEndpointMappingsForDatalake(datalakeId);
  }

  /**
   * Create an endpoint mapping (without selecting it)
   */
  async createEndpointMapping(endpointId: string, datalakeId: string): Promise<void> {
    if (!endpointId || endpointId.trim().length === 0) {
      throw new Error('API endpoint ID is required');
    }

    if (!datalakeId || datalakeId.trim().length === 0) {
      throw new Error('Datalake ID is required');
    }

    // Check if endpoint exists
    const endpoint = await this.datalakeRepo.getApiEndpoint(endpointId);
    if (!endpoint) {
      throw new Error('API endpoint not found');
    }

    // Check if datalake exists
    const datalake = await this.datalakeRepo.getDatalake(datalakeId);
    if (!datalake) {
      throw new Error('Datalake not found');
    }

    await this.datalakeRepo.createEndpointMapping(endpointId, datalakeId);
  }

  /**
   * Delete an endpoint mapping
   */
  async deleteEndpointMapping(endpointId: string, datalakeId: string): Promise<void> {
    if (!endpointId || endpointId.trim().length === 0) {
      throw new Error('API endpoint ID is required');
    }

    if (!datalakeId || datalakeId.trim().length === 0) {
      throw new Error('Datalake ID is required');
    }

    await this.datalakeRepo.deleteEndpointMapping(endpointId, datalakeId);
  }

  /**
   * Get adapter for a specific API endpoint
   * This is a helper method for repositories to get the appropriate adapter
   * Returns null if endpoint not found (allows fallback to direct FMP calls)
   */
  async getAdapterForEndpoint(endpointId: string, envApiKey?: string): Promise<import('../infrastructure/datalake/DatalakeAdapter').DatalakeAdapter | null> {
    try {
      const datalake = await this.getSelectedDatalakeForEndpoint(endpointId);
      if (!datalake) {
        return null;
      }

      const { DatalakeAdapterFactory } = await import('../infrastructure/datalake/DatalakeAdapterFactory');
      const factory = new DatalakeAdapterFactory(this.logger, envApiKey);
      return factory.createAdapter(datalake);
    } catch (error) {
      // If endpoint not found in database, return null to allow fallback to direct FMP calls
      // This is expected in test environments where datalake tables may not be seeded
      this.logger?.warn(`Datalake adapter not available for endpoint ${endpointId}, will fallback to direct FMP`, error);
      return null;
    }
  }
}

