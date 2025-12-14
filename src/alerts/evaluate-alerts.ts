import type { AlertRecord, AlertStateSnapshot } from "./types";

export interface EvaluateAlertsInput {
  alerts: AlertRecord[];
  priceBySymbol: Record<string, number | undefined>;
  stateByAlertId?: Record<string, AlertStateSnapshot | undefined>;
  timestamp: number;
}

export interface EvaluateAlertsResult {
  notifications: Array<{ alert: AlertRecord; price: number }>;
  stateUpdates: Record<string, AlertStateSnapshot>;
  skipped: Array<{ alert: AlertRecord; reason: string }>;
}

// Configuration for price change detection
const PRICE_CHANGE_THRESHOLD_PERCENT = 2.0; // Notify if price changes by 2%
const PRICE_CHANGE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes cooldown between notifications

export function evaluateAlerts({
  alerts,
  priceBySymbol,
  stateByAlertId = {},
  timestamp,
}: EvaluateAlertsInput): EvaluateAlertsResult {
  const notifications: Array<{ alert: AlertRecord; price: number }> = [];
  const skipped: Array<{ alert: AlertRecord; reason: string }> = [];
  const stateUpdates: Record<string, AlertStateSnapshot> = {};

  for (const alert of alerts) {
    if (alert.status !== "active") {
      skipped.push({ alert, reason: "inactive" });
      continue;
    }

    const price = priceBySymbol[alert.symbol];
    if (typeof price !== "number") {
      skipped.push({ alert, reason: "missing-price" });
      continue;
    }

    const conditionMet =
      alert.direction === "above"
        ? price >= alert.threshold
        : price <= alert.threshold;

    const prevState = stateByAlertId[alert.id];
    const alreadyReported = prevState?.lastConditionMet ?? false;

    const nextState: AlertStateSnapshot = {
      lastConditionMet: conditionMet,
      lastPrice: price,
      lastTriggeredAt: prevState?.lastTriggeredAt,
      lastNotifiedPrice: prevState?.lastNotifiedPrice,
      lastNotifiedAt: prevState?.lastNotifiedAt,
    };

    // Check if condition is met for the first time
    if (conditionMet && !alreadyReported) {
      notifications.push({ alert, price });
      nextState.lastTriggeredAt = timestamp;
      nextState.lastNotifiedPrice = price;
      nextState.lastNotifiedAt = timestamp;
    } 
    // Check for significant price change after condition is met
    else if (conditionMet && alreadyReported && prevState?.lastNotifiedPrice) {
      const lastNotifiedPrice = prevState.lastNotifiedPrice;
      const priceChangePercent = Math.abs((price - lastNotifiedPrice) / lastNotifiedPrice) * 100;
      const timeSinceLastNotification = prevState.lastNotifiedAt 
        ? timestamp - prevState.lastNotifiedAt 
        : Infinity;
      
      // Notify if price changed by threshold and cooldown has passed
      if (priceChangePercent >= PRICE_CHANGE_THRESHOLD_PERCENT && 
          timeSinceLastNotification >= PRICE_CHANGE_COOLDOWN_MS) {
        notifications.push({ alert, price });
        nextState.lastNotifiedPrice = price;
        nextState.lastNotifiedAt = timestamp;
      }
    }

    const shouldStore =
      !prevState ||
      prevState.lastConditionMet !== nextState.lastConditionMet ||
      prevState.lastPrice !== nextState.lastPrice ||
      prevState.lastTriggeredAt !== nextState.lastTriggeredAt ||
      prevState.lastNotifiedPrice !== nextState.lastNotifiedPrice ||
      prevState.lastNotifiedAt !== nextState.lastNotifiedAt;

    if (shouldStore) {
      stateUpdates[alert.id] = nextState;
    }
  }

  return { notifications, skipped, stateUpdates };
}
