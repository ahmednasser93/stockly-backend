import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { HistoricalRepository } from '../repositories/d1/HistoricalRepository';
import { HistoricalService } from '../services/historical.service';
import { D1DatabaseWrapper } from '../infrastructure/database/D1Database';
import { createDatalakeService } from './createDatalakeService';

export function createHistoricalService(env: Env, logger: Logger): HistoricalService {
  const db = new D1DatabaseWrapper(env.stockly, logger);
  const datalakeService = createDatalakeService(env, logger);
  const historicalRepo = new HistoricalRepository(db, env, logger, datalakeService);
  return new HistoricalService(historicalRepo);
}

