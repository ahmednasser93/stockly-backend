/**
 * Cron job for Senate Trading
 * Fetches senate trading data from FMP API and triggers alerts
 * Runs periodically (every 6 hours recommended)
 */

import type { Env } from "../index";
import { Logger } from "../logging/logger";
import { createSenateTradingService } from "../factories/createSenateTradingService";
import { evaluateSenatorAlerts } from "../alerts/evaluate-senator-alerts";

/**
 * Run senate trading cron job
 * 1. Fetch latest trades from FMP API
 * 2. Store new trades in database (deduplicate by fmp_id)
 * 3. Evaluate alerts for matching users
 */
export async function runSenateTradingCron(
  env: Env,
  ctx?: ExecutionContext
): Promise<void> {
  // Create logger for cron job
  const traceId = `senate-cron-${Date.now()}`;
  const logger = new Logger({
    traceId,
    userId: null,
    path: "/cron/senate-trading",
    service: "stockly-api",
  });

  try {
    logger.info("Starting senate trading cron job");

    // Step 1: Sync trades from FMP API
    const senateService = createSenateTradingService(env, logger);
    const syncResult = await senateService.syncSenateTrades();

    logger.info("Senate trades sync completed", {
      added: syncResult.added,
      updated: syncResult.updated,
      errors: syncResult.errors,
    });

    // Step 2: Evaluate alerts for new trades
    // Only evaluate if we got new trades (to avoid unnecessary processing)
    if (syncResult.added > 0 || syncResult.updated > 0) {
      logger.info("Evaluating senator alerts for new/updated trades");

      const alertResult = await evaluateSenatorAlerts(env, logger);

      logger.info("Senator alert evaluation completed", {
        tradesProcessed: alertResult.tradesProcessed,
        alertsSent: alertResult.alertsSent,
        alertsSkipped: alertResult.alertsSkipped,
        errors: alertResult.errors,
      });
    } else {
      logger.info("No new trades, skipping alert evaluation");
    }

    logger.info("Senate trading cron job completed successfully");
  } catch (error) {
    logger.error("Error in senate trading cron job", error);
    // Don't throw - cron jobs should fail gracefully
  }
}


