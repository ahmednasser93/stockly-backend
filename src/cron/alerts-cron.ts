import { API_KEY, API_URL } from "../util";
import type { Env } from "../index";
import { listActiveAlerts } from "../alerts/storage";
import { evaluateAlerts } from "../alerts/evaluate-alerts";
import type { AlertRecord } from "../alerts/types";
import { sendFCMNotification } from "../notifications/fcm-sender";
import { getConfig } from "../api/config";
import {
  loadAllStatesFromKV,
  updateStateInCache,
  flushPendingWritesToKV,
} from "../alerts/state-cache";

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

async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  const priceBySymbol: Record<string, number> = {};
  for (const symbol of symbols) {
    try {
      const price = await fetchQuote(symbol);
      if (typeof price === "number") {
        priceBySymbol[symbol] = price;
      }
    } catch (error) {
      console.error("failed to fetch quote for alert", { symbol, error });
    }
  }
  return priceBySymbol;
}

// Removed loadState - now using cache-based loadAllStatesFromKV

export async function runAlertCron(env: Env): Promise<void> {
  if (!env.alertsKv) {
    console.warn("alerts KV is not configured; skipping cron");
    return;
  }

  const alerts = await listActiveAlerts(env);
  if (!alerts.length) {
    return;
  }

  const symbols = Array.from(new Set(alerts.map((alert) => alert.symbol)));
  const priceBySymbol = await fetchPrices(symbols);
  if (!Object.keys(priceBySymbol).length) {
    console.warn("no prices available for alerts run");
    return;
  }

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
  for (const notification of result.notifications) {
    const { alert, price } = notification;
    
    console.log("ALERT_TRIGGERED", {
      id: alert.id,
      symbol: alert.symbol,
      price: price,
      direction: alert.direction,
      threshold: alert.threshold,
      channel: alert.channel,
    });

    // Send push notification if channel is "notification" and target is a push token
    if (alert.channel === "notification" && alert.target) {
      // Skip old Expo tokens - they need to be cleaned up
      if (alert.target.startsWith("ExponentPushToken[")) {
        console.warn(`⚠️ Skipping alert ${alert.id} with old Expo token. User needs to re-register with FCM token.`);
        const logId = `${alert.id}_${Date.now()}`;
        const now = new Date().toISOString();
        await env.stockly
          .prepare(
            `INSERT INTO notifications_log (id, alert_id, symbol, threshold, price, direction, push_token, status, error_message, sent_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(logId, alert.id, alert.symbol, alert.threshold, price, alert.direction, alert.target, "error", "Expo token detected - FCM migration required. User must re-register token.", now)
          .run();
        continue; // Skip this alert
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

      try {
        const sent = await sendFCMNotification(alert.target, title, body, pushData, env);
        const logId = `${alert.id}_${Date.now()}`;
        const now = new Date().toISOString();
        
        if (sent) {
          console.log(`✅ FCM notification sent for alert ${alert.id}`);
          // Log successful notification
          await env.stockly
            .prepare(
              `INSERT INTO notifications_log (id, alert_id, symbol, threshold, price, direction, push_token, status, sent_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(logId, alert.id, alert.symbol, alert.threshold, price, alert.direction, alert.target, "success", now)
            .run();
        } else {
          console.error(`❌ Failed to send FCM notification for alert ${alert.id}`);
          // Log failed notification
          await env.stockly
            .prepare(
              `INSERT INTO notifications_log (id, alert_id, symbol, threshold, price, direction, push_token, status, error_message, sent_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(logId, alert.id, alert.symbol, alert.threshold, price, alert.direction, alert.target, "failed", "Failed to send FCM notification", now)
            .run();
        }
      } catch (error) {
        console.error(`❌ Error sending FCM notification for alert ${alert.id}:`, error);
        // Log error
        const logId = `${alert.id}_${Date.now()}`;
        const now = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.message : String(error);
        await env.stockly
          .prepare(
            `INSERT INTO notifications_log (id, alert_id, symbol, threshold, price, direction, push_token, status, error_message, sent_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(logId, alert.id, alert.symbol, alert.threshold, price, alert.direction, alert.target, "error", errorMessage, now)
          .run();
      }
    }
  }
}
