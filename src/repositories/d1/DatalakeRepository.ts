/**
 * Datalake Repository Implementation
 * Manages datalakes, API endpoints, and their mappings in D1 database
 */

import type { IDatabase } from '../../infrastructure/database/IDatabase';
import type { IDatalakeRepository, Datalake, ApiEndpoint, DatalakeApiMapping, CreateDatalakeInput, UpdateDatalakeInput } from '../interfaces/IDatalakeRepository';
import type { Logger } from '../../logging/logger';

export class DatalakeRepository implements IDatalakeRepository {
  constructor(
    private db: IDatabase,
    private logger: Logger
  ) {}

  /**
   * Generate a unique ID for new records
   */
  private generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Get datalake by ID
   */
  async getDatalake(id: string): Promise<Datalake | null> {
    try {
      const row = await this.db
        .prepare('SELECT * FROM datalakes WHERE id = ?')
        .bind(id)
        .first<Datalake>();

      if (!row) {
        return null;
      }

      return {
        id: (row as any).id,
        name: (row as any).name,
        baseUrl: (row as any).base_url,
        apiKey: (row as any).api_key,
        authType: (row as any).auth_type as 'query_param' | 'header' | 'none',
        authKeyName: (row as any).auth_key_name,
        isActive: (row as any).is_active === 1,
        createdAt: (row as any).created_at,
        updatedAt: (row as any).updated_at,
      };
    } catch (error) {
      this.logger.error('Failed to get datalake', error);
      throw error;
    }
  }

  /**
   * Get all datalakes
   */
  async getAllDatalakes(): Promise<Datalake[]> {
    try {
      const result = await this.db
        .prepare('SELECT * FROM datalakes ORDER BY created_at ASC')
        .all<Datalake>();

      return result.results.map(row => ({
        id: (row as any).id,
        name: (row as any).name,
        baseUrl: (row as any).base_url,
        apiKey: (row as any).api_key,
        authType: (row as any).auth_type as 'query_param' | 'header' | 'none',
        authKeyName: (row as any).auth_key_name,
        isActive: (row as any).is_active === 1,
        createdAt: (row as any).created_at,
        updatedAt: (row as any).updated_at,
      }));
    } catch (error) {
      this.logger.error('Failed to get all datalakes', error);
      throw error;
    }
  }

  /**
   * Create a new datalake
   */
  async createDatalake(input: CreateDatalakeInput): Promise<Datalake> {
    try {
      const id = this.generateId();
      const now = Math.floor(Date.now() / 1000);

      await this.db
        .prepare(`
          INSERT INTO datalakes (id, name, base_url, api_key, auth_type, auth_key_name, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          id,
          input.name,
          input.baseUrl,
          input.apiKey || null,
          input.authType || 'query_param',
          input.authKeyName || 'apikey',
          input.isActive !== false ? 1 : 0,
          now,
          now
        )
        .run();

      const datalake = await this.getDatalake(id);
      if (!datalake) {
        throw new Error('Failed to retrieve created datalake');
      }

      return datalake;
    } catch (error) {
      this.logger.error('Failed to create datalake', error);
      throw error;
    }
  }

  /**
   * Update an existing datalake
   */
  async updateDatalake(id: string, updates: UpdateDatalakeInput): Promise<Datalake> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const setClauses: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) {
        setClauses.push('name = ?');
        values.push(updates.name);
      }
      if (updates.baseUrl !== undefined) {
        setClauses.push('base_url = ?');
        values.push(updates.baseUrl);
      }
      if (updates.apiKey !== undefined) {
        setClauses.push('api_key = ?');
        values.push(updates.apiKey || null);
      }
      if (updates.authType !== undefined) {
        setClauses.push('auth_type = ?');
        values.push(updates.authType);
      }
      if (updates.authKeyName !== undefined) {
        setClauses.push('auth_key_name = ?');
        values.push(updates.authKeyName);
      }
      if (updates.isActive !== undefined) {
        setClauses.push('is_active = ?');
        values.push(updates.isActive ? 1 : 0);
      }

      if (setClauses.length === 0) {
        // No updates, just return existing
        const datalake = await this.getDatalake(id);
        if (!datalake) {
          throw new Error('Datalake not found');
        }
        return datalake;
      }

      setClauses.push('updated_at = ?');
      values.push(now);
      values.push(id);

      await this.db
        .prepare(`UPDATE datalakes SET ${setClauses.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run();

      const datalake = await this.getDatalake(id);
      if (!datalake) {
        throw new Error('Failed to retrieve updated datalake');
      }

      return datalake;
    } catch (error) {
      this.logger.error('Failed to update datalake', error);
      throw error;
    }
  }

  /**
   * Delete a datalake
   */
  async deleteDatalake(id: string): Promise<void> {
    try {
      // First, delete all mappings for this datalake
      await this.db
        .prepare('DELETE FROM datalake_api_mappings WHERE datalake_id = ?')
        .bind(id)
        .run();

      // Then delete the datalake
      await this.db
        .prepare('DELETE FROM datalakes WHERE id = ?')
        .bind(id)
        .run();
    } catch (error) {
      this.logger.error('Failed to delete datalake', error);
      throw error;
    }
  }

  /**
   * Get API endpoint by ID
   */
  async getApiEndpoint(id: string): Promise<ApiEndpoint | null> {
    try {
      const row = await this.db
        .prepare('SELECT * FROM api_endpoints WHERE id = ?')
        .bind(id)
        .first<ApiEndpoint>();

      if (!row) {
        return null;
      }

      return {
        id: (row as any).id,
        name: (row as any).name,
        description: (row as any).description,
        endpointPath: (row as any).endpoint_path,
        httpMethod: (row as any).http_method,
        requiresSymbol: (row as any).requires_symbol === 1,
        createdAt: (row as any).created_at,
      };
    } catch (error) {
      this.logger.error('Failed to get API endpoint', error);
      throw error;
    }
  }

  /**
   * Get all API endpoints
   */
  async getAllApiEndpoints(): Promise<ApiEndpoint[]> {
    try {
      const result = await this.db
        .prepare('SELECT * FROM api_endpoints ORDER BY name ASC')
        .all<ApiEndpoint>();

      return result.results.map(row => ({
        id: (row as any).id,
        name: (row as any).name,
        description: (row as any).description,
        endpointPath: (row as any).endpoint_path,
        httpMethod: (row as any).http_method,
        requiresSymbol: (row as any).requires_symbol === 1,
        createdAt: (row as any).created_at,
      }));
    } catch (error) {
      this.logger.error('Failed to get all API endpoints', error);
      throw error;
    }
  }

  /**
   * Get selected datalake for an API endpoint
   */
  async getSelectedDatalakeForEndpoint(endpointId: string): Promise<Datalake | null> {
    try {
      const mapping = await this.db
        .prepare(`
          SELECT d.* FROM datalakes d
          INNER JOIN datalake_api_mappings m ON d.id = m.datalake_id
          WHERE m.api_endpoint_id = ? AND m.is_selected = 1
          LIMIT 1
        `)
        .bind(endpointId)
        .first<Datalake>();

      if (!mapping) {
        return null;
      }

      return {
        id: (mapping as any).id,
        name: (mapping as any).name,
        baseUrl: (mapping as any).base_url,
        apiKey: (mapping as any).api_key,
        authType: (mapping as any).auth_type as 'query_param' | 'header' | 'none',
        authKeyName: (mapping as any).auth_key_name,
        isActive: (mapping as any).is_active === 1,
        createdAt: (mapping as any).created_at,
        updatedAt: (mapping as any).updated_at,
      };
    } catch (error) {
      this.logger.error('Failed to get selected datalake for endpoint', error);
      throw error;
    }
  }

  /**
   * Set selected datalake for an API endpoint
   * This will unselect all other datalakes for this endpoint
   */
  async setSelectedDatalakeForEndpoint(endpointId: string, datalakeId: string): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);

      // First, unselect all datalakes for this endpoint
      await this.db
        .prepare('UPDATE datalake_api_mappings SET is_selected = 0, updated_at = ? WHERE api_endpoint_id = ?')
        .bind(now, endpointId)
        .run();

      // Check if mapping exists
      const existingMapping = await this.db
        .prepare('SELECT id FROM datalake_api_mappings WHERE api_endpoint_id = ? AND datalake_id = ?')
        .bind(endpointId, datalakeId)
        .first<{ id: string }>();

      if (existingMapping) {
        // Update existing mapping to selected
        await this.db
          .prepare('UPDATE datalake_api_mappings SET is_selected = 1, updated_at = ? WHERE id = ?')
          .bind(now, existingMapping.id)
          .run();
      } else {
        // Create new mapping
        const mappingId = this.generateId();
        await this.db
          .prepare(`
            INSERT INTO datalake_api_mappings (id, api_endpoint_id, datalake_id, is_selected, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .bind(mappingId, endpointId, datalakeId, 1, now, now)
          .run();
      }
    } catch (error) {
      this.logger.error('Failed to set selected datalake for endpoint', error);
      throw error;
    }
  }

  /**
   * Get all endpoint mappings for a datalake
   */
  async getEndpointMappingsForDatalake(datalakeId: string): Promise<DatalakeApiMapping[]> {
    try {
      const result = await this.db
        .prepare(`
          SELECT m.* FROM datalake_api_mappings m
          WHERE m.datalake_id = ?
          ORDER BY m.created_at ASC
        `)
        .bind(datalakeId)
        .all<DatalakeApiMapping>();

      return result.results.map(row => ({
        id: (row as any).id,
        apiEndpointId: (row as any).api_endpoint_id,
        datalakeId: (row as any).datalake_id,
        isSelected: (row as any).is_selected === 1,
        createdAt: (row as any).created_at,
        updatedAt: (row as any).updated_at,
      }));
    } catch (error) {
      this.logger.error('Failed to get endpoint mappings for datalake', error);
      throw error;
    }
  }

  /**
   * Create an endpoint mapping (without selecting it)
   */
  async createEndpointMapping(endpointId: string, datalakeId: string): Promise<void> {
    try {
      const mappingId = this.generateId();
      const now = Math.floor(Date.now() / 1000);

      await this.db
        .prepare(`
          INSERT INTO datalake_api_mappings (id, api_endpoint_id, datalake_id, is_selected, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(mappingId, endpointId, datalakeId, 0, now, now)
        .run();
    } catch (error) {
      this.logger.error('Failed to create endpoint mapping', error);
      throw error;
    }
  }

  /**
   * Delete an endpoint mapping
   */
  async deleteEndpointMapping(endpointId: string, datalakeId: string): Promise<void> {
    try {
      await this.db
        .prepare('DELETE FROM datalake_api_mappings WHERE api_endpoint_id = ? AND datalake_id = ?')
        .bind(endpointId, datalakeId)
        .run();
    } catch (error) {
      this.logger.error('Failed to delete endpoint mapping', error);
      throw error;
    }
  }
}

