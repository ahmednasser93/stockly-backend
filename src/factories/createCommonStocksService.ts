import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { CommonStocksRepository } from '../repositories/d1/CommonStocksRepository';
import { CommonStocksService } from '../services/common-stocks.service';
import { D1DatabaseWrapper } from '../infrastructure/database/D1Database';

export function createCommonStocksService(env: Env, logger: Logger): CommonStocksService {
  const db = new D1DatabaseWrapper(env.stockly, logger);
  const commonStocksRepo = new CommonStocksRepository(db);
  return new CommonStocksService(commonStocksRepo);
}

