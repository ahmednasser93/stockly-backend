/**
 * Factory function to create CalendarService instance
 */

import { CalendarService } from '../services/calendar.service';
import { CalendarRepository } from '../repositories/external/CalendarRepository';
import type { Env } from '../index';
import type { Logger } from '../logging/logger';
import { createDatalakeService } from './createDatalakeService';

export function createCalendarService(env: Env, logger: Logger): CalendarService {
  const datalakeService = createDatalakeService(env, logger);
  const repository = new CalendarRepository(env, logger, datalakeService);
  return new CalendarService(repository, env, logger);
}

