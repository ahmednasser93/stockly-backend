/**
 * Alert evaluation logic for Senate Trading
 * Matches trades with user holdings and followed senators, then sends notifications
 */

import type { Env } from "../index";
import type { Logger } from "../logging/logger";
import { createSenateTradingService } from "../factories/createSenateTradingService";
import type { SenateTradeRecord } from "../senate-trading/types";
import { formatSenatorAlertMessage } from "../senate-trading/models";
import { sendFCMNotification } from "../notifications/fcm-sender";

/**
 * Get user's favorite stocks (holdings)
 */
async function getUserFavoriteStocks(
  env: Env,
  username: string
): Promise<string[]> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT symbol FROM user_favorite_stocks WHERE username = ? ORDER BY display_order`
      )
      .bind(username)
      .all<{ symbol: string }>();

    return (result.results ?? []).map((row) => row.symbol.toUpperCase());
  } catch (error) {
    console.error("[getUserFavoriteStocks] Error:", error);
    return [];
  }
}

/**
 * Get user's senator alert preferences
 */
async function getUserSenatorAlertPreferences(
  env: Env,
  userId: string
): Promise<{
  senatorAlertsEnabled: boolean;
  senatorAlertHoldingsOnly: boolean;
  senatorAlertFollowedOnly: boolean;
}> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT senator_alerts_enabled, senator_alert_holdings_only, senator_alert_followed_only
         FROM user_notification_preferences
         WHERE user_id = ?`
      )
      .bind(userId)
      .first<{
        senator_alerts_enabled: number | null;
        senator_alert_holdings_only: number | null;
        senator_alert_followed_only: number | null;
      }>();

    if (!result) {
      // Default preferences
      return {
        senatorAlertsEnabled: true,
        senatorAlertHoldingsOnly: false,
        senatorAlertFollowedOnly: false,
      };
    }

    return {
      senatorAlertsEnabled: Boolean(result.senator_alerts_enabled ?? 1),
      senatorAlertHoldingsOnly: Boolean(result.senator_alert_holdings_only ?? 0),
      senatorAlertFollowedOnly: Boolean(result.senator_alert_followed_only ?? 0),
    };
  } catch (error) {
    console.error("[getUserSenatorAlertPreferences] Error:", error);
    // Default preferences on error
    return {
      senatorAlertsEnabled: true,
      senatorAlertHoldingsOnly: false,
      senatorAlertFollowedOnly: false,
    };
  }
}

/**
 * Check if a trade should trigger an alert for a user
 */
async function shouldAlertUser(
  env: Env,
  trade: SenateTradeRecord,
  userId: string,
  username: string,
  logger: Logger
): Promise<{ shouldAlert: boolean; reason?: string }> {
  try {
    // Get user preferences
    const prefs = await getUserSenatorAlertPreferences(env, userId);

    // Check if senator alerts are enabled
    if (!prefs.senatorAlertsEnabled) {
      return { shouldAlert: false, reason: "senator alerts disabled" };
    }

    // Get user's favorite stocks (holdings)
    const favoriteStocks = await getUserFavoriteStocks(env, username);
    const hasStock = favoriteStocks.includes(trade.symbol.toUpperCase());

    // Get user's followed senators
    const senateService = createSenateTradingService(env, logger);
    const userFollows = await senateService.getUserFollows(userId);
    const followedSenators = new Set(
      userFollows.map((f) => f.senatorName.toLowerCase())
    );
    const isFollowing = followedSenators.has(trade.senatorName.toLowerCase());

    // Check if user follows this senator
    const follow = userFollows.find(
      (f) => f.senatorName.toLowerCase() === trade.senatorName.toLowerCase()
    );

    // Check transaction type preferences
    if (follow) {
      const shouldAlertOnType =
        (trade.transactionType === "Purchase" && follow.alertOnPurchase) ||
        (trade.transactionType === "Sale" && follow.alertOnSale) ||
        trade.transactionType === "Exchange";

      if (!shouldAlertOnType) {
        return {
          shouldAlert: false,
          reason: `user doesn't want alerts for ${trade.transactionType}`,
        };
      }
    }

    // Apply filtering preferences
    if (prefs.senatorAlertHoldingsOnly && !hasStock) {
      return { shouldAlert: false, reason: "holdings only mode and stock not held" };
    }

    if (prefs.senatorAlertFollowedOnly && !isFollowing) {
      return { shouldAlert: false, reason: "followed only mode and senator not followed" };
    }

    // Alert if:
    // 1. User holds the stock (regardless of follow status), OR
    // 2. User follows the senator (and preferences allow this transaction type)
    if (hasStock || isFollowing) {
      return { shouldAlert: true };
    }

    return { shouldAlert: false, reason: "no match with holdings or follows" };
  } catch (error) {
    logger.error("Error checking if should alert user", error, {
      userId,
      username,
      tradeId: trade.id,
    });
    return { shouldAlert: false, reason: "error checking preferences" };
  }
}

/**
 * Send notification to user about senator trade
 */
async function sendSenatorTradeNotification(
  env: Env,
  trade: SenateTradeRecord,
  userId: string,
  username: string,
  logger: Logger
): Promise<{ success: boolean; sent: number; failed: number }> {
  try {
    // Get all active push tokens for this user
    const userTokens = await env.stockly
      .prepare(
        `SELECT dpt.push_token, d.device_type
         FROM device_push_tokens dpt
         INNER JOIN devices d ON dpt.device_id = d.id
         INNER JOIN users u ON d.user_id = u.id
         WHERE u.username = ? AND dpt.is_active = 1 AND d.is_active = 1`
      )
      .bind(username)
      .all<{ push_token: string; device_type: string | null }>();

    if (!userTokens.results || userTokens.results.length === 0) {
      logger.warn("No push tokens found for senator trade alert", {
        userId,
        username,
        tradeId: trade.id,
      });
      return { success: false, sent: 0, failed: 0 };
    }

    // Format alert message
    const title = "Senator Trading Alert";
    const body = formatSenatorAlertMessage(
      trade.senatorName,
      trade.transactionType,
      trade.symbol,
      trade.amountRangeMin,
      trade.amountRangeMax
    );

    const pushData = {
      type: "senator_trade",
      tradeId: trade.id,
      symbol: trade.symbol,
      senatorName: trade.senatorName,
      transactionType: trade.transactionType,
      amountRangeMin: trade.amountRangeMin,
      amountRangeMax: trade.amountRangeMax,
      disclosureDate: trade.disclosureDate,
    };

    let sent = 0;
    let failed = 0;

    // Send notification to all devices
    for (const tokenRow of userTokens.results) {
      const pushToken = tokenRow.push_token;

      // Skip old Expo tokens
      if (pushToken.startsWith("ExponentPushToken[")) {
        logger.warn("Skipping senator alert with old Expo token", {
          tradeId: trade.id,
          pushToken: pushToken.substring(0, 50),
        });
        failed++;
        continue;
      }

      try {
        const success = await sendFCMNotification(
          pushToken,
          title,
          body,
          pushData,
          env,
          logger
        );

        // Log notification
        const logId = `${trade.id}_${userId}_${Date.now()}_${pushToken.substring(0, 20)}`;
        const now = new Date().toISOString();
        await env.stockly
          .prepare(
            `INSERT INTO notifications_log 
             (id, alert_id, symbol, threshold, price, direction, push_token, status, error_message, username, sent_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            logId,
            `senator_${trade.id}`, // Use trade ID as alert_id
            trade.symbol,
            0, // threshold not applicable
            0, // price not applicable
            "senator_trade", // direction field repurposed
            pushToken,
            success ? "success" : "error",
            success ? null : "FCM send failed",
            username,
            now
          )
          .run();

        if (success) {
          sent++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        logger.error("Error sending senator trade notification", error, {
          tradeId: trade.id,
          pushToken: pushToken.substring(0, 50),
        });
      }
    }

    return { success: sent > 0, sent, failed };
  } catch (error) {
    logger.error("Error in sendSenatorTradeNotification", error, {
      userId,
      username,
      tradeId: trade.id,
    });
    return { success: false, sent: 0, failed: 0 };
  }
}

/**
 * Evaluate senator alerts for recent trades
 * Checks all recent trades and sends notifications to matching users
 */
export async function evaluateSenatorAlerts(
  env: Env,
  logger: Logger
): Promise<{
  tradesProcessed: number;
  alertsSent: number;
  alertsSkipped: number;
  errors: number;
}> {
  logger.info("Starting senator alert evaluation");

  let tradesProcessed = 0;
  let alertsSent = 0;
  let alertsSkipped = 0;
  let errors = 0;

  try {
    const senateService = createSenateTradingService(env, logger);

    // Get trades from last 24 hours (or since last run)
    const sinceDate = new Date();
    sinceDate.setHours(sinceDate.getHours() - 24);
    const sinceDateStr = sinceDate.toISOString().split("T")[0]; // YYYY-MM-DD format

    const recentTrades = await senateService.getTradesSince(sinceDateStr, 1000);
    logger.info(`Found ${recentTrades.length} recent trades to evaluate`);

    // Get all users with active devices
    const users = await env.stockly
      .prepare(
        `SELECT DISTINCT u.id, u.username
         FROM users u
         INNER JOIN devices d ON u.id = d.user_id AND d.is_active = 1
         INNER JOIN device_push_tokens dpt ON d.id = dpt.device_id AND dpt.is_active = 1
         WHERE u.username IS NOT NULL`
      )
      .all<{ id: string; username: string }>();

    logger.info(`Evaluating alerts for ${users.results?.length || 0} users`);

    // For each trade, check all users
    for (const trade of recentTrades) {
      tradesProcessed++;

      for (const user of users.results || []) {
        try {
          const shouldAlert = await shouldAlertUser(
            env,
            trade,
            user.id,
            user.username,
            logger
          );

          if (shouldAlert.shouldAlert) {
            const result = await sendSenatorTradeNotification(
              env,
              trade,
              user.id,
              user.username,
              logger
            );

            if (result.success) {
              alertsSent++;
              logger.info("Senator trade alert sent", {
                userId: user.id,
                username: user.username,
                tradeId: trade.id,
                symbol: trade.symbol,
                senator: trade.senatorName,
              });
            } else {
              alertsSkipped++;
              logger.warn("Senator trade alert skipped", {
                userId: user.id,
                username: user.username,
                tradeId: trade.id,
                reason: "notification send failed",
              });
            }
          } else {
            alertsSkipped++;
            // Only log if it's an interesting skip (not just "no match")
            if (shouldAlert.reason && !shouldAlert.reason.includes("no match")) {
              logger.debug("Senator trade alert skipped", {
                userId: user.id,
                username: user.username,
                tradeId: trade.id,
                reason: shouldAlert.reason,
              });
            }
          }
        } catch (error) {
          errors++;
          logger.error("Error evaluating senator alert for user", error, {
            userId: user.id,
            username: user.username,
            tradeId: trade.id,
          });
        }
      }
    }

    logger.info("Senator alert evaluation completed", {
      tradesProcessed,
      alertsSent,
      alertsSkipped,
      errors,
    });

    return { tradesProcessed, alertsSent, alertsSkipped, errors };
  } catch (error) {
    logger.error("Error in evaluateSenatorAlerts", error);
    throw error;
  }
}


