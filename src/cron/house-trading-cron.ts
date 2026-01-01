/**
 * Cron job for House Trading
 * Fetches house trading data from FMP API
 * Runs periodically (every 6 hours recommended)
 */

import type { Env } from "../index";
import { Logger } from "../logging/logger";
import { createHouseTradingService } from "../factories/createHouseTradingService";

/**
 * Run house trading cron job
 * 1. Fetch latest trades from FMP API
 * 2. Store new trades in database (deduplicate by fmp_id)
 */
export async function runHouseTradingCron(
  env: Env,
  ctx?: ExecutionContext
): Promise<void> {
  // Create logger for cron job
  const traceId = `house-cron-${Date.now()}`;
  const logger = new Logger({
    traceId,
    userId: null,
    path: "/cron/house-trading",
    service: "stockly-api",
  });

  try {
    logger.info("Starting house trading cron job");

    // Step 1: Sync trades from FMP API
    const houseService = createHouseTradingService(env, logger);
    const syncResult = await houseService.syncHouseTrades();

    logger.info("House trades sync completed", {
      added: syncResult.added,
      updated: syncResult.updated,
      errors: syncResult.errors,
    });

    logger.info("House trading cron job completed successfully");
  } catch (error) {
    logger.error("Error in house trading cron job", error);
    // Don't throw - cron jobs should fail gracefully
  }
}

