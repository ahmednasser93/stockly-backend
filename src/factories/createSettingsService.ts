/**
 * Factory function for creating SettingsService instances
 * Implements lightweight dependency injection
 */

import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { SettingsRepository } from '../repositories/d1/SettingsRepository';
import { SettingsService } from '../services/settings.service';
import { D1Database } from '../infrastructure/database/D1Database';

export function createSettingsService(env: Env, logger: Logger): SettingsService {
  const db = new D1Database(env.stockly, logger);
  const settingsRepo = new SettingsRepository(db);
  return new SettingsService(settingsRepo);
}

