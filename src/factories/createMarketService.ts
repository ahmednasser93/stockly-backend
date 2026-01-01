/**
 * Factory function to create MarketService instance
 */

import { MarketService } from '../services/market.service';
import { MarketRepository } from '../repositories/external/MarketRepository';
import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { createDatalakeService } from './createDatalakeService';

export function createMarketService(env: Env, logger: Logger): MarketService {
  const datalakeService = createDatalakeService(env, logger);
  const repository = new MarketRepository(env, logger, datalakeService);
  return new MarketService(repository, env, logger);
}


