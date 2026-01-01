/**
 * Datalake Adapter Factory
 * Creates appropriate adapter instances based on datalake configuration
 */

import type { DatalakeAdapter } from './DatalakeAdapter';
import type { Datalake } from '../../repositories/interfaces/IDatalakeRepository';
import { FMPDatalakeAdapter } from './FMPDatalakeAdapter';
import { GenericDatalakeAdapter } from './GenericDatalakeAdapter';
import type { Logger } from '../../logging/logger';

export class DatalakeAdapterFactory {
  constructor(
    private logger?: Logger,
    private envApiKey?: string
  ) {}

  /**
   * Create an adapter for the given datalake
   * 
   * @param datalake - Datalake configuration
   * @returns Appropriate adapter instance
   */
  createAdapter(datalake: Datalake): DatalakeAdapter {
    // Use FMP adapter for default FMP datalake
    if (datalake.id === 'fmp-default' || datalake.name.toLowerCase() === 'fmp') {
      return new FMPDatalakeAdapter(datalake, this.logger, this.envApiKey);
    }

    // Use generic adapter for all other datalakes
    return new GenericDatalakeAdapter(datalake, this.logger);
  }
}

