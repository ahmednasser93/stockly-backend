/**
 * FMP Datalake Adapter
 * Adapter for Financial Modeling Prep datalake
 * Handles FMP-specific response normalization
 */

import type { DatalakeAdapter } from './DatalakeAdapter';
import type { Datalake } from '../../repositories/interfaces/IDatalakeRepository';
import { DatalakeHttpClient } from './DatalakeHttpClient';
import type { Logger } from '../../logging/logger';
import { API_KEY } from '../../util';

export class FMPDatalakeAdapter implements DatalakeAdapter {
  private httpClient: DatalakeHttpClient;
  private datalakeWithApiKey: Datalake;

  constructor(
    datalake: Datalake,
    private logger?: Logger,
    envApiKey?: string
  ) {
    this.httpClient = new DatalakeHttpClient(logger);
    // Use env API key if datalake's apiKey is null/empty (for FMP default)
    this.datalakeWithApiKey = {
      ...datalake,
      apiKey: datalake.apiKey || envApiKey || API_KEY,
    };
  }

  /**
   * Fetch data from FMP datalake
   * FMP responses are already in the expected format, so minimal normalization is needed
   */
  async fetch<T = any>(endpointPath: string, params: Record<string, string>): Promise<T> {
    const data = await this.httpClient.fetchJson<T>(endpointPath, params, this.datalakeWithApiKey);
    return data;
  }
}

