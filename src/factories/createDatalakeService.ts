/**
 * Factory for creating DatalakeService instances
 */

import { DatalakeService } from '../services/datalake.service';
import { DatalakeRepository } from '../repositories/d1/DatalakeRepository';
import { D1DatabaseWrapper } from '../infrastructure/database/D1Database';
import type { Env } from '../index';
import type { Logger } from '../logging/logger';

export function createDatalakeService(env: Env, logger: Logger): DatalakeService {
  const db = new D1DatabaseWrapper(env.stockly, logger);
  const datalakeRepo = new DatalakeRepository(db, logger);
  return new DatalakeService(datalakeRepo, logger);
}

