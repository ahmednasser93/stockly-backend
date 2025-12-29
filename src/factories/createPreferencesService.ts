/**
 * Factory function for creating PreferencesService instances
 * Implements lightweight dependency injection
 */

import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { PreferencesRepository } from '../repositories/d1/PreferencesRepository';
import { PreferencesService } from '../services/preferences.service';
import { D1Database } from '../infrastructure/database/D1Database';

export function createPreferencesService(env: Env, logger: Logger): PreferencesService {
  const db = new D1Database(env.stockly, logger);
  const preferencesRepo = new PreferencesRepository(db);
  return new PreferencesService(preferencesRepo);
}

