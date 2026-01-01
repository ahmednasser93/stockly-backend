import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { QuotesRepository } from '../repositories/external/QuotesRepository';
import { QuotesService } from '../services/quotes.service';
import { D1DatabaseWrapper } from '../infrastructure/database/D1Database';
import { createDatalakeService } from './createDatalakeService';

export function createQuotesService(env: Env, logger: Logger): QuotesService {
  const db = new D1DatabaseWrapper(env.stockly, logger);
  const datalakeService = createDatalakeService(env, logger);
  const quotesRepo = new QuotesRepository(db, env, logger, datalakeService);
  return new QuotesService(quotesRepo, env, logger);
}

