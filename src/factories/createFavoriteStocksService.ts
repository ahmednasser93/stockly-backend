import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { FavoriteStocksRepository } from '../repositories/d1/FavoriteStocksRepository';
import { FavoriteStocksService } from '../services/favorite-stocks.service';
import { D1DatabaseWrapper } from '../infrastructure/database/D1Database';

export function createFavoriteStocksService(env: Env, logger: Logger): FavoriteStocksService {
  const db = new D1DatabaseWrapper(env.stockly, logger);
  const favoriteStocksRepo = new FavoriteStocksRepository(db);
  return new FavoriteStocksService(favoriteStocksRepo);
}

