/**
 * Factory for creating DividendService instance
 */

import { DividendService } from '../services/dividend.service';
import { DividendRepository } from '../repositories/external/DividendRepository';
import type { Env } from '../index';
import type { Logger } from '../logging/logger';

export function createDividendService(env: Env, logger?: Logger): DividendService {
  const repository = new DividendRepository(env, logger);
  return new DividendService(repository, env, logger);
}

