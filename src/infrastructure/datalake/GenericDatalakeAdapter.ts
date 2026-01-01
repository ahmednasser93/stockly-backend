/**
 * Generic Datalake Adapter
 * Adapter for generic datalakes that follow FMP-compatible response format
 * Can be extended with custom normalization logic if needed
 */

import type { DatalakeAdapter } from './DatalakeAdapter';
import type { Datalake } from '../../repositories/interfaces/IDatalakeRepository';
import { DatalakeHttpClient } from './DatalakeHttpClient';
import type { Logger } from '../../logging/logger';

export class GenericDatalakeAdapter implements DatalakeAdapter {
  private httpClient: DatalakeHttpClient;

  constructor(
    private datalake: Datalake,
    private logger?: Logger
  ) {
    this.httpClient = new DatalakeHttpClient(logger);
  }

  /**
   * Fetch data from generic datalake
   * Assumes the datalake follows FMP-compatible response format
   * Can be extended with custom normalization if needed
   */
  async fetch<T = any>(endpointPath: string, params: Record<string, string>): Promise<T> {
    const data = await this.httpClient.fetchJson<T>(endpointPath, params, this.datalake);
    
    // Generic datalakes should return FMP-compatible format
    // If normalization is needed, it can be added here
    // For now, we assume the format is already compatible
    
    return data;
  }
}

