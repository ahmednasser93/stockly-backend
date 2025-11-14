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
    };

    if (conditionMet && !alreadyReported) {
      notifications.push({ alert, price });
      nextState.lastTriggeredAt = timestamp;
    }

    const shouldStore =
      !prevState ||
      prevState.lastConditionMet !== nextState.lastConditionMet ||
      prevState.lastPrice !== nextState.lastPrice ||
      prevState.lastTriggeredAt !== nextState.lastTriggeredAt;

    if (shouldStore) {
      stateUpdates[alert.id] = nextState;
    }
  }

  return { notifications, skipped, stateUpdates };
}
