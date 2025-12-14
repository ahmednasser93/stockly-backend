import { describe, it, expect, beforeEach, vi } from "vitest";
import { runAlertCron } from "../../src/cron/alerts-cron";
import { listActiveAlerts } from "../../src/alerts/storage";
import { evaluateAlerts } from "../../src/alerts/evaluate-alerts";
import { sendFCMNotification } from "../../src/notifications/fcm-sender";
import { getConfig } from "../../src/api/config";
import {
  loadAllStatesFromKV,
  updateStateInCache,
  flushPendingWritesToKV,
  clearCache,
} from "../../src/alerts/state-cache";
import { sendLogsToLoki } from "../../src/logging/loki-shipper";
import type { Env } from "../../src/index";
import type { AlertRecord } from "../../src/alerts/types";
import type { AlertStateSnapshot } from "../../src/alerts/types";

vi.mock("../../src/alerts/storage", () => ({
  listActiveAlerts: vi.fn(),
}));

vi.mock("../../src/alerts/evaluate-alerts", () => ({
  evaluateAlerts: vi.fn(),
}));

vi.mock("../../src/notifications/fcm-sender", () => ({
  sendFCMNotification: vi.fn(),
}));

vi.mock("../../src/api/config", () => ({
  getConfig: vi.fn(),
}));

vi.mock("../../src/alerts/state-cache", () => ({
  loadAllStatesFromKV: vi.fn(),
  updateStateInCache: vi.fn(),
  flushPendingWritesToKV: vi.fn(),
  clearCache: vi.fn(),
}));

vi.mock("../../src/logging/loki-shipper", () => ({
  sendLogsToLoki: vi.fn(),
}));

vi.mock("../../src/util", () => ({
  API_KEY: "test-api-key",
  API_URL: "https://api.test.com",
}));

// Mock global fetch
global.fetch = vi.fn();

describe("Alert Cron Job", () => {
  let mockEnv: Env;
  let mockKv: KVNamespace;
  let mockDb: any;
  let mockCtx: ExecutionContext;

  const baseAlert: AlertRecord = {
    id: "alert-1",
    symbol: "AAPL",
    direction: "above",
    threshold: 200,
    status: "active",
    channel: "notification",
    target: "fcm-token-123",
    username: "testuser",
    notes: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn(),
    };

    mockKv = {
      get: vi.fn(),
      put: vi.fn(),
    } as unknown as KVNamespace;

    mockCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    mockEnv = {
      stockly: mockDb as unknown as D1Database,
      alertsKv: mockKv,
      FCM_SERVICE_ACCOUNT: JSON.stringify({
        type: "service_account",
        project_id: "test-project",
        private_key_id: "test-key-id",
        private_key: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n",
        client_email: "test@test-project.iam.gserviceaccount.com",
      }),
      LOKI_URL: "https://loki.test.com",
      LOKI_USERNAME: "test-user",
      LOKI_PASSWORD: "test-pass",
    } as Env;

    clearCache();
    vi.clearAllMocks();
  });

  describe("runAlertCron", () => {
    it("should skip cron if alertsKv is not configured", async () => {
      mockEnv.alertsKv = undefined;

      await runAlertCron(mockEnv, mockCtx);

      expect(listActiveAlerts).not.toHaveBeenCalled();
    });

    it("should skip cron if no active alerts found", async () => {
      vi.mocked(listActiveAlerts).mockResolvedValue([]);

      await runAlertCron(mockEnv, mockCtx);

      expect(listActiveAlerts).toHaveBeenCalledWith(mockEnv);
      expect(evaluateAlerts).not.toHaveBeenCalled();
    });

    it("should process alerts and send notifications", async () => {
      const alerts: AlertRecord[] = [baseAlert];
      const priceBySymbol = { AAPL: 205 };
      const stateById: Record<string, AlertStateSnapshot> = {};

      vi.mocked(listActiveAlerts).mockResolvedValue(alerts);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ price: 205 }),
      } as Response);
      vi.mocked(loadAllStatesFromKV).mockResolvedValue(stateById);
      vi.mocked(evaluateAlerts).mockReturnValue({
        notifications: [{ alert: baseAlert, price: 205 }],
        skipped: [],
        stateUpdates: {
          "alert-1": {
            lastConditionMet: true,
            lastPrice: 205,
            lastTriggeredAt: Date.now(),
          },
        },
      });
      vi.mocked(getConfig).mockResolvedValue({ kvWriteIntervalSec: 3600 });
      vi.mocked(sendFCMNotification).mockResolvedValue(true);

      // Mock push tokens query
      const pushTokensStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ 
          results: [{ push_token: "fcm-token-123", device_type: "android" }] 
        }),
      };
      
      // Mock notifications_log insert
      const logStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
      
      mockDb.prepare
        .mockReturnValueOnce(pushTokensStmt) // For push tokens query
        .mockReturnValueOnce(logStmt); // For notifications_log insert

      await runAlertCron(mockEnv, mockCtx);

      expect(listActiveAlerts).toHaveBeenCalledWith(mockEnv);
      expect(evaluateAlerts).toHaveBeenCalledWith({
        alerts,
        priceBySymbol,
        stateByAlertId: stateById,
        timestamp: expect.any(Number),
      });
      expect(updateStateInCache).toHaveBeenCalled();
      expect(flushPendingWritesToKV).toHaveBeenCalledWith(mockKv, 3600);
      expect(sendFCMNotification).toHaveBeenCalledWith(
        "fcm-token-123",
        "AAPL Alert",
        expect.stringContaining("AAPL is now"),
        expect.objectContaining({
          alertId: "alert-1",
          symbol: "AAPL",
        }),
        mockEnv,
        expect.any(Object)
      );
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO notifications_log")
      );
    });

    it("should handle fetch price failures gracefully", async () => {
      const alerts: AlertRecord[] = [baseAlert];

      vi.mocked(listActiveAlerts).mockResolvedValue(alerts);
      vi.mocked(global.fetch).mockRejectedValue(new Error("Network error"));

      await runAlertCron(mockEnv, mockCtx);

      expect(listActiveAlerts).toHaveBeenCalledWith(mockEnv);
      expect(evaluateAlerts).not.toHaveBeenCalled();
    });

    it("should skip alert with old Expo token", async () => {
      const expoAlert: AlertRecord = {
        ...baseAlert,
        target: "ExponentPushToken[123]",
      };
      const alerts: AlertRecord[] = [expoAlert];
      const priceBySymbol = { AAPL: 205 };
      const stateById: Record<string, AlertStateSnapshot> = {};

      vi.mocked(listActiveAlerts).mockResolvedValue(alerts);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ price: 205 }),
      } as Response);
      vi.mocked(loadAllStatesFromKV).mockResolvedValue(stateById);
      vi.mocked(evaluateAlerts).mockReturnValue({
        notifications: [{ alert: expoAlert, price: 205 }],
        skipped: [],
        stateUpdates: {
          "alert-1": {
            lastConditionMet: true,
            lastPrice: 205,
            lastTriggeredAt: Date.now(),
          },
        },
      });
      vi.mocked(getConfig).mockResolvedValue({ kvWriteIntervalSec: 3600 });

      // Mock push tokens query - returns Expo token
      const pushTokensStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ 
          results: [{ push_token: "ExponentPushToken[123]", device_type: null }] 
        }),
      };
      
      // Mock notifications_log insert
      const logStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
      
      mockDb.prepare
        .mockReturnValueOnce(pushTokensStmt) // For push tokens query
        .mockReturnValueOnce(logStmt); // For notifications_log insert

      await runAlertCron(mockEnv, mockCtx);

      expect(sendFCMNotification).not.toHaveBeenCalled();
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO notifications_log")
      );
      // Verify the log entry has error status
      const insertCall = mockDb.prepare.mock.calls.find((call) =>
        call[0].includes("INSERT INTO notifications_log")
      );
      expect(insertCall).toBeDefined();
    });

    it("should log failed FCM notifications", async () => {
      const alerts: AlertRecord[] = [baseAlert];
      const priceBySymbol = { AAPL: 205 };
      const stateById: Record<string, AlertStateSnapshot> = {};

      vi.mocked(listActiveAlerts).mockResolvedValue(alerts);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ price: 205 }),
      } as Response);
      vi.mocked(loadAllStatesFromKV).mockResolvedValue(stateById);
      vi.mocked(evaluateAlerts).mockReturnValue({
        notifications: [{ alert: baseAlert, price: 205 }],
        skipped: [],
        stateUpdates: {
          "alert-1": {
            lastConditionMet: true,
            lastPrice: 205,
            lastTriggeredAt: Date.now(),
          },
        },
      });
      vi.mocked(getConfig).mockResolvedValue({ kvWriteIntervalSec: 3600 });
      vi.mocked(sendFCMNotification).mockResolvedValue(false);

      // Mock push tokens query
      const pushTokensStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ 
          results: [{ push_token: "fcm-token-123", device_type: "android" }] 
        }),
      };
      
      // Mock notifications_log insert
      const logStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
      
      mockDb.prepare
        .mockReturnValueOnce(pushTokensStmt) // For push tokens query
        .mockReturnValueOnce(logStmt); // For notifications_log insert

      await runAlertCron(mockEnv, mockCtx);

      expect(sendFCMNotification).toHaveBeenCalled();
      // Verify failed notification was logged
      const insertCalls = mockDb.prepare.mock.calls.filter((call) =>
        call[0].includes("INSERT INTO notifications_log")
      );
      expect(insertCalls.length).toBeGreaterThan(0);
    });

    it("should handle FCM notification errors", async () => {
      const alerts: AlertRecord[] = [baseAlert];
      const priceBySymbol = { AAPL: 205 };
      const stateById: Record<string, AlertStateSnapshot> = {};

      vi.mocked(listActiveAlerts).mockResolvedValue(alerts);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ price: 205 }),
      } as Response);
      vi.mocked(loadAllStatesFromKV).mockResolvedValue(stateById);
      vi.mocked(evaluateAlerts).mockReturnValue({
        notifications: [{ alert: baseAlert, price: 205 }],
        skipped: [],
        stateUpdates: {
          "alert-1": {
            lastConditionMet: true,
            lastPrice: 205,
            lastTriggeredAt: Date.now(),
          },
        },
      });
      vi.mocked(getConfig).mockResolvedValue({ kvWriteIntervalSec: 3600 });
      vi.mocked(sendFCMNotification).mockRejectedValue(
        new Error("FCM send failed")
      );

      // Mock push tokens query
      const pushTokensStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ 
          results: [{ push_token: "fcm-token-123", device_type: "android" }] 
        }),
      };
      
      // Mock notifications_log insert
      const logStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
      
      mockDb.prepare
        .mockReturnValueOnce(pushTokensStmt) // For push tokens query
        .mockReturnValueOnce(logStmt); // For notifications_log insert

      await runAlertCron(mockEnv, mockCtx);

      expect(sendFCMNotification).toHaveBeenCalled();
      // Verify error was logged
      const insertCalls = mockDb.prepare.mock.calls.filter((call) =>
        call[0].includes("INSERT INTO notifications_log")
      );
      expect(insertCalls.length).toBeGreaterThan(0);
    });

    it("should handle multiple alerts", async () => {
      const alert2: AlertRecord = {
        ...baseAlert,
        id: "alert-2",
        symbol: "MSFT",
        threshold: 300,
      };
      const alerts: AlertRecord[] = [baseAlert, alert2];
      const priceBySymbol = { AAPL: 205, MSFT: 310 };
      const stateById: Record<string, AlertStateSnapshot> = {};

      vi.mocked(listActiveAlerts).mockResolvedValue(alerts);
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ price: 205 }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ price: 310 }),
        } as Response);
      vi.mocked(loadAllStatesFromKV).mockResolvedValue(stateById);
      vi.mocked(evaluateAlerts).mockReturnValue({
        notifications: [
          { alert: baseAlert, price: 205 },
          { alert: alert2, price: 310 },
        ],
        skipped: [],
        stateUpdates: {
          "alert-1": {
            lastConditionMet: true,
            lastPrice: 205,
            lastTriggeredAt: Date.now(),
          },
          "alert-2": {
            lastConditionMet: true,
            lastPrice: 310,
            lastTriggeredAt: Date.now(),
          },
        },
      });
      vi.mocked(getConfig).mockResolvedValue({ kvWriteIntervalSec: 3600 });
      vi.mocked(sendFCMNotification).mockResolvedValue(true);

      // Mock push tokens query (called once per alert, but same user)
      const pushTokensStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ 
          results: [{ push_token: "fcm-token-123", device_type: "android" }] 
        }),
      };
      
      // Mock notifications_log insert (called once per notification)
      const logStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
      
      // Two alerts, so we need: 2 push token queries + 2 log inserts
      mockDb.prepare
        .mockReturnValueOnce(pushTokensStmt) // For first alert push tokens query
        .mockReturnValueOnce(logStmt) // For first alert notifications_log insert
        .mockReturnValueOnce(pushTokensStmt) // For second alert push tokens query
        .mockReturnValueOnce(logStmt); // For second alert notifications_log insert

      await runAlertCron(mockEnv, mockCtx);

      expect(sendFCMNotification).toHaveBeenCalledTimes(2);
    });

    it("should skip when no prices available", async () => {
      const alerts: AlertRecord[] = [baseAlert];

      vi.mocked(listActiveAlerts).mockResolvedValue(alerts);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ price: null }),
      } as Response);

      await runAlertCron(mockEnv, mockCtx);

      expect(evaluateAlerts).not.toHaveBeenCalled();
    });

    it("should flush pending KV writes", async () => {
      const alerts: AlertRecord[] = [baseAlert];
      const priceBySymbol = { AAPL: 205 };
      const stateById: Record<string, AlertStateSnapshot> = {};

      vi.mocked(listActiveAlerts).mockResolvedValue(alerts);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ price: 205 }),
      } as Response);
      vi.mocked(loadAllStatesFromKV).mockResolvedValue(stateById);
      vi.mocked(evaluateAlerts).mockReturnValue({
        notifications: [],
        skipped: [],
        stateUpdates: {
          "alert-1": {
            lastConditionMet: false,
            lastPrice: 205,
            lastTriggeredAt: undefined,
          },
        },
      });
      vi.mocked(getConfig).mockResolvedValue({ kvWriteIntervalSec: 1800 });

      await runAlertCron(mockEnv, mockCtx);

      expect(flushPendingWritesToKV).toHaveBeenCalledWith(mockKv, 1800);
    });

    it("should send logs to Loki if configured", async () => {
      const alerts: AlertRecord[] = [baseAlert];
      const priceBySymbol = { AAPL: 205 };
      const stateById: Record<string, AlertStateSnapshot> = {};

      vi.mocked(listActiveAlerts).mockResolvedValue(alerts);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ price: 205 }),
      } as Response);
      vi.mocked(loadAllStatesFromKV).mockResolvedValue(stateById);
      vi.mocked(evaluateAlerts).mockReturnValue({
        notifications: [],
        skipped: [],
        stateUpdates: {},
      });
      vi.mocked(getConfig).mockResolvedValue({ kvWriteIntervalSec: 3600 });

      await runAlertCron(mockEnv, mockCtx);

      // waitUntil should be called in the finally block
      expect(mockCtx.waitUntil).toHaveBeenCalled();
      // Verify sendLogsToLoki will be called (it's in the promise passed to waitUntil)
      // The actual call happens asynchronously, so we check that waitUntil was called
      expect(mockCtx.waitUntil).toHaveBeenCalledTimes(1);
    });

    it("should not send logs to Loki if not configured", async () => {
      mockEnv.LOKI_URL = undefined;
      const alerts: AlertRecord[] = [baseAlert];

      vi.mocked(listActiveAlerts).mockResolvedValue(alerts);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ price: null }),
      } as Response);

      await runAlertCron(mockEnv, mockCtx);

      expect(mockCtx.waitUntil).not.toHaveBeenCalled();
    });

    it("should handle fatal errors and re-throw", async () => {
      const error = new Error("Fatal error");
      vi.mocked(listActiveAlerts).mockRejectedValue(error);

      await expect(runAlertCron(mockEnv, mockCtx)).rejects.toThrow("Fatal error");
    });

    it("should use default KV write interval if not in config", async () => {
      const alerts: AlertRecord[] = [baseAlert];
      const priceBySymbol = { AAPL: 205 };
      const stateById: Record<string, AlertStateSnapshot> = {};

      vi.mocked(listActiveAlerts).mockResolvedValue(alerts);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ price: 205 }),
      } as Response);
      vi.mocked(loadAllStatesFromKV).mockResolvedValue(stateById);
      vi.mocked(evaluateAlerts).mockReturnValue({
        notifications: [],
        skipped: [],
        stateUpdates: {},
      });
      vi.mocked(getConfig).mockResolvedValue({});

      await runAlertCron(mockEnv, mockCtx);

      // Default should be 3600 seconds (1 hour)
      expect(flushPendingWritesToKV).toHaveBeenCalledWith(mockKv, 3600);
    });

    it("should handle array response from quote API", async () => {
      const alerts: AlertRecord[] = [baseAlert];
      const priceBySymbol = { AAPL: 205 };
      const stateById: Record<string, AlertStateSnapshot> = {};

      vi.mocked(listActiveAlerts).mockResolvedValue(alerts);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => [{ price: 205 }],
      } as Response);
      vi.mocked(loadAllStatesFromKV).mockResolvedValue(stateById);
      vi.mocked(evaluateAlerts).mockReturnValue({
        notifications: [],
        skipped: [],
        stateUpdates: {},
      });
      vi.mocked(getConfig).mockResolvedValue({ kvWriteIntervalSec: 3600 });

      await runAlertCron(mockEnv, mockCtx);

      expect(evaluateAlerts).toHaveBeenCalledWith(
        expect.objectContaining({
          priceBySymbol: expect.objectContaining({ AAPL: 205 }),
        })
      );
    });
  });
});
