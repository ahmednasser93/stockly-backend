/**
 * Factory function for creating AlertService instances
 * Implements lightweight dependency injection
 */

import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { D1Database } from '../infrastructure/database/D1Database';
import { AlertRepository } from '../repositories/d1/AlertRepository';
import { AlertService } from '../services/alerts.service';

export function createAlertService(env: Env, logger: Logger): AlertService {
  const db = new D1Database(env.stockly, logger);
  const alertRepo = new AlertRepository(db);
  return new AlertService(alertRepo);
}

