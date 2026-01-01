/**
 * Factory function to create SenateTradingService instance
 * Follows the existing factory pattern in the codebase
 */

import type { Env } from "../index";
import type { Logger } from "../logging/logger";
import { SenateTradingService } from "../services/senate-trading.service";

export function createSenateTradingService(env: Env, logger: Logger): SenateTradingService {
  return new SenateTradingService(env, logger);
}


