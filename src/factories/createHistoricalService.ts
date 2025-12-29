import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { HistoricalRepository } from '../repositories/d1/HistoricalRepository';
import { HistoricalService } from '../services/historical.service';
import { D1DatabaseWrapper } from '../infrastructure/database/D1Database';

export function createHistoricalService(env: Env, logger: Logger): HistoricalService {
  const db = new D1DatabaseWrapper(env.stockly, logger);
  const historicalRepo = new HistoricalRepository(db, env, logger);
  return new HistoricalService(historicalRepo);
}

