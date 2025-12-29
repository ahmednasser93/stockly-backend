import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { QuotesRepository } from '../repositories/external/QuotesRepository';
import { QuotesService } from '../services/quotes.service';
import { D1DatabaseWrapper } from '../infrastructure/database/D1Database';

export function createQuotesService(env: Env, logger: Logger): QuotesService {
  const db = new D1DatabaseWrapper(env.stockly, logger);
  const quotesRepo = new QuotesRepository(db, env, logger);
  return new QuotesService(quotesRepo);
}

