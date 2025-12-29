import { API_KEY, API_URL } from "../util";
import type { Env } from "../index";
import { evaluateAlerts } from "../alerts/evaluate-alerts";
import type { AlertRecord } from "../alerts/types";
import type { Alert } from "@stockly/shared/types";
import { sendFCMNotification } from "../notifications/fcm-sender";
import { getConfig } from "../api/config";
import {
  loadAllStatesFromKV,
  updateStateInCache,
  flushPendingWritesToKV,
} from "../alerts/state-cache";
import { Logger } from "../logging/logger";
import { sendLogsToLoki } from "../logging/loki-shipper";
import { createAlertService } from "../factories/createAlertService";

async function fetchQuote(symbol: string): Promise<number | null> {
  const endpoint = `${API_URL}/quote?symbol=${symbol}&apikey=${API_KEY}`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`quote request failed for ${symbol}`);
  }
  const payload = await res.json();
  const normalized = Array.isArray(payload) ? payload[0] : payload;
  if (!normalized || typeof normalized.price !== "number") {
    return null;
  }
  return normalized.price;
}

async function fetchPrices(symbols: string[], logger: Logger): Promise<Record<string, number>> {
  const priceBySymbol: Record<string, number> = {};
  for (const symbol of symbols) {
    try {
      const price = await fetchQuote(symbol);
      if (typeof price === "number") {
        priceBySymbol[symbol] = price;
      }
    } catch (error) {
      logger.error("Failed to fetch quote for alert", error, { symbol });
    }
  }
  return priceBySymbol;
}

// Removed loadState - now using cache-based loadAllStatesFromKV

export async function runAlertCron(env: Env, ctx?: ExecutionContext): Promise<void> {
  // Create logger for cron job
  const traceId = `cron-${Date.now()}`;
  const logger = new Logger({
    traceId,
    userId: null,
    path: "/cron/alerts",
    service: "stockly-api",
  });

  try {
    if (!env.alertsKv) {
      logger.warn("Alerts KV is not configured; skipping cron");
      return;
    }

    logger.info("Starting alert evaluation cron job");

    // Use new AlertRepository to get active alerts
    const alertService = createAlertService(env, logger);
    const allAlerts: Alert[] = await alertService.listAlerts(null); // null = admin, gets all alerts
    const alerts: AlertRecord[] = allAlerts
      .filter(alert => alert.status === 'active')
      .map(alert => ({
        id: alert.id,
        symbol: alert.symbol,
        direction: alert.direction,
        threshold: alert.threshold,
        status: alert.status,
        channel: alert.channel,
        notes: alert.notes,
        username: alert.username,
        createdAt: alert.createdAt,
        updatedAt: alert.updatedAt,
    })) as AlertRecord[];
    if (!alerts.length) {
      logger.info("No active alerts found");
      return;
    }

    logger.info(`Processing ${alerts.length} active alerts`);

    const symbols = Array.from(new Set(alerts.map((alert) => alert.symbol)));
    logger.debug(`Fetching prices for ${symbols.length} unique symbols`, { symbols });
    
    const priceBySymbol = await fetchPrices(symbols, logger);
    if (!Object.keys(priceBySymbol).length) {
      logger.warn("No prices available for alerts run", { symbols });
      return;
    }

    logger.info(`Successfully fetched prices for ${Object.keys(priceBySymbol).length} symbols`);

    // Load states from cache (or KV if cache is empty/expired)
    const alertIds = alerts.map(a => a.id);
    const stateById = await loadAllStatesFromKV(env.alertsKv, alertIds);
    
    // Evaluate alerts using cached states
    const result = evaluateAlerts({
      alerts,
      priceBySymbol,
      stateByAlertId: stateById,
      timestamp: Date.now(),
    });

    // Update states in memory cache (queued for batched KV write)
    // This does NOT write to KV immediately - writes are batched
    for (const [id, snapshot] of Object.entries(result.stateUpdates)) {
      updateStateInCache(id, snapshot);
    }
    
    // Get config to check KV write interval
    const config = await getConfig(env);
    const kvWriteIntervalSec = config.kvWriteIntervalSec || 3600; // Default: 1 hour
    
    // Check if we should flush pending writes to KV (based on configured interval)
    await flushPendingWritesToKV(env.alertsKv, kvWriteIntervalSec);

    // Send Expo Push Notifications for triggered alerts
    logger.info(`Evaluated ${alerts.length} alerts, ${result.notifications.length} triggered`);

    for (const notification of result.notifications) {
      const { alert, price } = notification;
      
      logger.info("Alert triggered", {
        alertId: alert.id,
        symbol: alert.symbol,
        price: price,
        direction: alert.direction,
        threshold: alert.threshold,
        channel: alert.channel,
      });

      // Send push notification if channel is "notification" and username exists
      if (alert.channel === "notification" && alert.username) {
        // Get all active push tokens for this username (using new schema)
        const userTokens = await env.stockly
          .prepare(
            `SELECT dpt.push_token, d.device_type
             FROM device_push_tokens dpt
             INNER JOIN devices d ON dpt.device_id = d.id
             INNER JOIN users u ON d.user_id = u.id
             WHERE u.username = ? AND dpt.is_active = 1 AND d.is_active = 1`
          )
          .bind(alert.username)
          .all<{ push_token: string; device_type: string | null }>();

        if (!userTokens.results || userTokens.results.length === 0) {
          logger.warn("No push tokens found for username", {
            alertId: alert.id,
            symbol: alert.symbol,
            username: alert.username,
          });
          continue; // Skip this alert - no devices to notify
        }

        const title = `${alert.symbol} Alert`;
        const body = 
          alert.direction === "above"
            ? `${alert.symbol} is now $${price.toFixed(2)} (above your target of $${alert.threshold.toFixed(2)})`
            : `${alert.symbol} is now $${price.toFixed(2)} (below your target of $${alert.threshold.toFixed(2)})`;
        
        const pushData = {
          alertId: alert.id,
          symbol: alert.symbol,
          price: price,
          threshold: alert.threshold,
          direction: alert.direction,
        };

        // Send notification to all devices for this user
        let successCount = 0;
        let failCount = 0;

        for (const tokenRow of userTokens.results) {
          const pushToken = tokenRow.push_token;

          // Skip old Expo tokens - they need to be cleaned up
          if (pushToken.startsWith("ExponentPushToken[")) {
            logger.warn("Skipping alert with old Expo token - FCM migration required", {
              alertId: alert.id,
              symbol: alert.symbol,
              pushToken: pushToken.substring(0, 50),
            });
            const logId = `${alert.id}_${Date.now()}_${pushToken.substring(0, 20)}`;
            const now = new Date().toISOString();
            await env.stockly
              .prepare(
                `INSERT INTO notifications_log (id, alert_id, symbol, threshold, price, direction, push_token, status, error_message, username, sent_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(logId, alert.id, alert.symbol, alert.threshold, price, alert.direction, pushToken, "error", "Expo token detected - FCM migration required. User must re-register token.", alert.username, now)
              .run();
            failCount++;
            continue;
          }

          try {
            const sent = await sendFCMNotification(pushToken, title, body, pushData, env, logger);
            const logId = `${alert.id}_${Date.now()}_${pushToken.substring(0, 20)}`;
            const now = new Date().toISOString();
            
            if (sent) {
              successCount++;
              logger.info("FCM notification sent successfully", {
                alertId: alert.id,
                symbol: alert.symbol,
                pushToken: pushToken.substring(0, 50),
              });
              // Log successful notification with username
              await env.stockly
                .prepare(
                  `INSERT INTO notifications_log (id, alert_id, symbol, threshold, price, direction, push_token, status, username, sent_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                )
                .bind(logId, alert.id, alert.symbol, alert.threshold, price, alert.direction, pushToken, "success", alert.username, now)
                .run();
            } else {
              failCount++;
              logger.error("Failed to send FCM notification", new Error("FCM send returned false"), {
                alertId: alert.id,
                symbol: alert.symbol,
                pushToken: pushToken.substring(0, 50),
              });
              // Log failed notification with username
              await env.stockly
                .prepare(
                  `INSERT INTO notifications_log (id, alert_id, symbol, threshold, price, direction, push_token, status, error_message, username, sent_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                )
                .bind(logId, alert.id, alert.symbol, alert.threshold, price, alert.direction, pushToken, "failed", "Failed to send FCM notification", alert.username, now)
                .run();
            }
          } catch (error) {
            failCount++;
            logger.error("Error sending FCM notification", error, {
              alertId: alert.id,
              symbol: alert.symbol,
              pushToken: pushToken.substring(0, 50),
            });
            // Log error with username
            const logId = `${alert.id}_${Date.now()}_${pushToken.substring(0, 20)}`;
            const now = new Date().toISOString();
            const errorMessage = error instanceof Error ? error.message : String(error);
            await env.stockly
              .prepare(
                `INSERT INTO notifications_log (id, alert_id, symbol, threshold, price, direction, push_token, status, error_message, username, sent_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(logId, alert.id, alert.symbol, alert.threshold, price, alert.direction, pushToken, "error", errorMessage, alert.username, now)
              .run();
          }
        }

        logger.info("Alert notification sent to all user devices", {
          alertId: alert.id,
          symbol: alert.symbol,
          username: alert.username,
          devicesCount: userTokens.results.length,
          successCount,
          failCount,
        });
      } else if (alert.channel === "notification" && !alert.username) {
        logger.warn("Alert has no username - cannot send notification", {
          alertId: alert.id,
          symbol: alert.symbol,
        });
      }
    }

    logger.info("Alert cron job completed successfully", {
      alertsProcessed: alerts.length,
      notificationsSent: result.notifications.length,
    });
  } catch (error) {
    logger.error("Fatal error in alert cron job", error);
    throw error; // Re-throw to ensure Cloudflare Workers logs it
  } finally {
    // Ship logs to Loki if configured
    if (env.LOKI_URL && ctx) {
      ctx.waitUntil(
        sendLogsToLoki(logger.getLogs(), {
          url: env.LOKI_URL,
          username: env.LOKI_USERNAME,
          password: env.LOKI_PASSWORD,
        })
      );
    }
  }
}
