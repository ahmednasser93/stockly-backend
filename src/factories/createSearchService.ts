import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { SearchRepository } from '../repositories/external/SearchRepository';
import { SearchService } from '../services/search.service';
import { D1DatabaseWrapper } from '../infrastructure/database/D1Database';
import { createDatalakeService } from './createDatalakeService';

export function createSearchService(env: Env, logger: Logger): SearchService {
  const db = new D1DatabaseWrapper(env.stockly, logger);
  const datalakeService = createDatalakeService(env, logger);
  const searchRepo = new SearchRepository(db, logger, env, datalakeService);
  return new SearchService(searchRepo, env, logger);
}

