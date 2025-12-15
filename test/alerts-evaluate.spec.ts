import { describe, it, expect } from "vitest";
import { evaluateAlerts } from "../src/alerts/evaluate-alerts";
import type { AlertRecord } from "../src/alerts/types";

const baseAlert: AlertRecord = {
  id: "a1",
  symbol: "AAPL",
  direction: "above",
  threshold: 200,
  status: "active",
  channel: "notification",
  target: "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  notes: null,
  username: "testuser", // Added username
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

describe("evaluateAlerts", () => {
  it("notifies only when direction condition transitions from false to true", () => {
    const firstPass = evaluateAlerts({
      alerts: [baseAlert],
      priceBySymbol: { AAPL: 205 },
      timestamp: 1,
    });

    expect(firstPass.notifications).toHaveLength(1);
    expect(Object.keys(firstPass.stateUpdates)).toEqual([baseAlert.id]);

    const secondPass = evaluateAlerts({
      alerts: [baseAlert],
      priceBySymbol: { AAPL: 210 },
      stateByAlertId: { [baseAlert.id]: firstPass.stateUpdates[baseAlert.id] },
      timestamp: 2,
    });

    expect(secondPass.notifications).toHaveLength(0);
    expect(secondPass.stateUpdates[baseAlert.id].lastPrice).toBe(210);
  });

  it("resets state when price falls back below threshold", () => {
    const activeState = { lastConditionMet: true, lastPrice: 205, lastTriggeredAt: 1 };
    const resetPass = evaluateAlerts({
      alerts: [baseAlert],
      priceBySymbol: { AAPL: 190 },
      stateByAlertId: { [baseAlert.id]: activeState },
      timestamp: 3,
    });

    expect(resetPass.notifications).toHaveLength(0);
    expect(resetPass.stateUpdates[baseAlert.id].lastConditionMet).toBe(false);

    const reTrigger = evaluateAlerts({
      alerts: [baseAlert],
      priceBySymbol: { AAPL: 205 },
      stateByAlertId: { [baseAlert.id]: resetPass.stateUpdates[baseAlert.id] },
      timestamp: 4,
    });

    expect(reTrigger.notifications).toHaveLength(1);
  });

  it("skips alerts that lack a price", () => {
    const result = evaluateAlerts({
      alerts: [baseAlert],
      priceBySymbol: {},
      timestamp: 5,
    });

    expect(result.notifications).toHaveLength(0);
    expect(result.skipped[0].reason).toBe("missing-price");
  });

  it("notifies on significant price change after initial trigger (2% change)", () => {
    // Initial state: already notified at 200
    const prevState = {
      lastConditionMet: true,
      lastPrice: 200,
      lastTriggeredAt: 1000,
      lastNotifiedPrice: 200,
      lastNotifiedAt: 1000,
    };

    // 1. Small change (< 2%) -> No notification
    const smallChange = evaluateAlerts({
      alerts: [baseAlert],
      priceBySymbol: { AAPL: 203 }, // 1.5% change
      stateByAlertId: { [baseAlert.id]: prevState },
      timestamp: 1000 + 15 * 60 * 1000 + 1, // After cooldown
    });
    expect(smallChange.notifications).toHaveLength(0);

    // 2. Large change (>= 2%) -> Notification
    const largeChange = evaluateAlerts({
      alerts: [baseAlert],
      priceBySymbol: { AAPL: 204 }, // 2% change
      stateByAlertId: { [baseAlert.id]: prevState },
      timestamp: 1000 + 15 * 60 * 1000 + 1, // After cooldown
    });
    expect(largeChange.notifications).toHaveLength(1);
    expect(largeChange.stateUpdates[baseAlert.id].lastNotifiedPrice).toBe(204);
  });

  it("suppresses notifications during cooldown period", () => {
    const prevState = {
      lastConditionMet: true,
      lastPrice: 200,
      lastTriggeredAt: 1000,
      lastNotifiedPrice: 200,
      lastNotifiedAt: 1000,
    };

    // Significant change but within cooldown
    const earlyCheck = evaluateAlerts({
      alerts: [baseAlert],
      priceBySymbol: { AAPL: 210 }, // 5% change
      stateByAlertId: { [baseAlert.id]: prevState },
      timestamp: 1000 + 10 * 60 * 1000, // 10 mins later (cooldown is 15)
    });

    expect(earlyCheck.notifications).toHaveLength(0);
    // State should update (price changed), but lastNotifiedAt should NOT change
    expect(earlyCheck.stateUpdates[baseAlert.id]).toBeDefined();
    expect(earlyCheck.stateUpdates[baseAlert.id].lastNotifiedAt).toBe(1000);
    expect(earlyCheck.stateUpdates[baseAlert.id].lastPrice).toBe(210);
  });

  it("handles 'below' direction correctly", () => {
    const belowAlert: AlertRecord = { ...baseAlert, direction: "below", threshold: 100 };

    // 1. Price above threshold -> No notification
    const resultAbove = evaluateAlerts({
      alerts: [belowAlert],
      priceBySymbol: { AAPL: 105 },
      timestamp: 1,
    });
    expect(resultAbove.notifications).toHaveLength(0);

    // 2. Price drops below -> Notification
    const resultBelow = evaluateAlerts({
      alerts: [belowAlert],
      priceBySymbol: { AAPL: 95 },
      stateByAlertId: { [belowAlert.id]: resultAbove.stateUpdates[belowAlert.id] },
      timestamp: 2,
    });
    expect(resultBelow.notifications).toHaveLength(1);
    expect(resultBelow.stateUpdates[belowAlert.id].lastConditionMet).toBe(true);
  });
});
