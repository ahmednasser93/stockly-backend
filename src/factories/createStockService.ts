/**
 * Factory function for creating StockService instances
 * Implements lightweight dependency injection
 */

import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { StockRepository } from '../repositories/external/StockRepository';
import { StockService } from '../services/stocks.service';
import { createDatalakeService } from './createDatalakeService';

export function createStockService(env: Env, logger: Logger): StockService {
  const datalakeService = createDatalakeService(env, logger);
  const stockRepo = new StockRepository(env, logger, datalakeService);
  return new StockService(stockRepo, env, logger);
}

