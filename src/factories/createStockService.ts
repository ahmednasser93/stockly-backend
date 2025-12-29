/**
 * Factory function for creating StockService instances
 * Implements lightweight dependency injection
 */

import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { StockRepository } from '../repositories/external/StockRepository';
import { StockService } from '../services/stocks.service';

export function createStockService(env: Env, logger: Logger): StockService {
  const stockRepo = new StockRepository(env, logger);
  return new StockService(stockRepo);
}

