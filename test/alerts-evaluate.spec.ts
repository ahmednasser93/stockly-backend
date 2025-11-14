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
});
