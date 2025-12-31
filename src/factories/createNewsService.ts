/**
 * Factory function for creating NewsService instances
 * Implements lightweight dependency injection
 */

import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { NewsRepository } from '../repositories/external/NewsRepository';
import { NewsService } from '../services/news.service';

export function createNewsService(env: Env, logger: Logger): NewsService {
  const newsRepo = new NewsRepository(env, logger);
  return new NewsService(newsRepo, env, logger);
}

