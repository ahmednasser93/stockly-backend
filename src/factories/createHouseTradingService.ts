/**
 * Factory function to create HouseTradingService instance
 */

import type { Env } from "../index";
import type { Logger } from "../logging/logger";
import { HouseTradingService } from "../services/house-trading.service";

export function createHouseTradingService(env: Env, logger: Logger): HouseTradingService {
  return new HouseTradingService(env, logger);
}

