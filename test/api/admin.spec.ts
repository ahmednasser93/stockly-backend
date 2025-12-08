import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getRecentNotifications,
  getFailedNotifications,
  retryNotification,
} from "../../src/api/admin";
import { sendFCMNotificationWithLogs } from "../../src/notifications/fcm-sender";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";

vi.mock("../../src/notifications/fcm-sender", () => ({
  sendFCMNotificationWithLogs: vi.fn(),
}));

describe("Admin API", () => {
  let mockEnv: Env;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn(),
    };

    mockEnv = {
      stockly: mockDb as unknown as D1Database,
      alertsKv: undefined,
      FCM_SERVICE_ACCOUNT: JSON.stringify({
        type: "service_account",
        project_id: "test-project",
        private_key_id: "test-key-id",
        private_key: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n",
        client_email: "test@test-project.iam.gserviceaccount.com",
      }),
    } as Env;

    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  describe("getRecentNotifications", () => {
    it("should return recent notifications", async () => {
      const mockNotifications = [
        {
          id: "log-1",
          alert_id: "alert-1",
          symbol: "AAPL",
          threshold: 200,
          price: 205,
          direction: "above",
          push_token: "fcm-token-1",
          status: "success",
          error_message: null,
          attempt_count: 1,
          sent_at: "2025-01-01T00:00:00Z",
        },
        {
          id: "log-2",
          alert_id: "alert-2",
          symbol: "MSFT",
          threshold: 300,
          price: 295,
          direction: "below",
          push_token: "fcm-token-2",
          status: "failed",
          error_message: "Token invalid",
          attempt_count: 2,
          sent_at: "2025-01-01T01:00:00Z",
        },
      ];

      const mockStmt = {
        all: vi.fn().mockResolvedValue({ results: mockNotifications }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getRecentNotifications(mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.notifications).toHaveLength(2);
      expect(data.notifications[0]).toMatchObject({
        id: "log-1",
        alertId: "alert-1",
        symbol: "AAPL",
        threshold: 200,
        price: 205,
        direction: "above",
        pushToken: "fcm-token-1",
        status: "success",
        errorMessage: null,
        attemptCount: 1,
        sentAt: "2025-01-01T00:00:00Z",
      });
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id, alert_id, symbol")
      );
    });

    it("should return empty array when no notifications", async () => {
      const mockStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getRecentNotifications(mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.notifications).toEqual([]);
    });

    it("should handle database errors", async () => {
      const mockStmt = {
        all: vi.fn().mockRejectedValue(new Error("Database error")),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getRecentNotifications(mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to retrieve recent notifications");
    });

    it("should limit to 100 notifications", async () => {
      const mockStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      await getRecentNotifications(mockEnv, mockLogger);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 100")
      );
    });

    it("should order by sent_at DESC", async () => {
      const mockStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      await getRecentNotifications(mockEnv, mockLogger);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY sent_at DESC")
      );
    });
  });

  describe("getFailedNotifications", () => {
    it("should return only failed notifications", async () => {
      const mockNotifications = [
        {
          id: "log-1",
          alert_id: "alert-1",
          symbol: "AAPL",
          threshold: 200,
          price: 205,
          direction: "above",
          push_token: "fcm-token-1",
          status: "failed",
          error_message: "Token invalid",
          attempt_count: 2,
          sent_at: "2025-01-01T00:00:00Z",
        },
        {
          id: "log-2",
          alert_id: "alert-2",
          symbol: "MSFT",
          threshold: 300,
          price: 295,
          direction: "below",
          push_token: "fcm-token-2",
          status: "error",
          error_message: "Network error",
          attempt_count: 3,
          sent_at: "2025-01-01T01:00:00Z",
        },
      ];

      const mockStmt = {
        all: vi.fn().mockResolvedValue({ results: mockNotifications }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getFailedNotifications(mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.notifications).toHaveLength(2);
      expect(data.notifications[0].status).toBe("failed");
      expect(data.notifications[1].status).toBe("error");
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("WHERE status IN ('failed', 'error')")
      );
    });

    it("should return empty array when no failed notifications", async () => {
      const mockStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getFailedNotifications(mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.notifications).toEqual([]);
    });

    it("should handle database errors", async () => {
      const mockStmt = {
        all: vi.fn().mockRejectedValue(new Error("Database error")),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getFailedNotifications(mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to retrieve failed notifications");
    });
  });

  describe("retryNotification", () => {
    it("should retry failed notification successfully", async () => {
      const mockLog = {
        id: "log-1",
        alert_id: "alert-1",
        symbol: "AAPL",
        threshold: 200,
        price: 205,
        direction: "above",
        push_token: "fcm-token-1",
        status: "failed",
        error_message: "Previous error",
        attempt_count: 1,
        sent_at: "2025-01-01T00:00:00Z",
      };

      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockLog),
      };

      const mockInsertStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT")) {
          return mockSelectStmt;
        }
        if (query.includes("INSERT")) {
          return mockInsertStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(undefined),
        };
      });

      vi.mocked(sendFCMNotificationWithLogs).mockResolvedValue({
        success: true,
        logs: [],
        messageId: "new-message-id",
      });

      const response = await retryNotification("log-1", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(sendFCMNotificationWithLogs).toHaveBeenCalledWith(
        "fcm-token-1",
        expect.stringContaining("AAPL"),
        expect.stringContaining("205"),
        expect.any(Object),
        mockEnv
      );
    });

    it("should return 404 when log not found", async () => {
      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      mockDb.prepare.mockReturnValue(mockSelectStmt);

      const response = await retryNotification("non-existent", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Notification log not found");
    });

    it("should handle retry failure", async () => {
      const mockLog = {
        id: "log-1",
        alert_id: "alert-1",
        symbol: "AAPL",
        threshold: 200,
        price: 205,
        direction: "above",
        push_token: "fcm-token-1",
        status: "failed",
        error_message: "Previous error",
        attempt_count: 1,
        sent_at: "2025-01-01T00:00:00Z",
      };

      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockLog),
      };

      const mockInsertStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT")) {
          return mockSelectStmt;
        }
        if (query.includes("INSERT")) {
          return mockInsertStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(undefined),
        };
      });

      vi.mocked(sendFCMNotificationWithLogs).mockResolvedValue({
        success: false,
        logs: [],
        finalError: "Token invalid",
        errorType: "NOT_FOUND",
        shouldCleanupToken: true,
      });

      const response = await retryNotification("log-1", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.errorMessage).toContain("Token invalid");
      
      // Should create new log entry for retry
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO notifications_log")
      );
    });

    it("should create new log entry with attempt count 1", async () => {
      const mockLog = {
        id: "log-1",
        alert_id: "alert-1",
        symbol: "AAPL",
        threshold: 200,
        price: 205,
        direction: "above",
        push_token: "fcm-token-1",
        status: "failed",
        error_message: "Previous error",
        attempt_count: 2,
        sent_at: "2025-01-01T00:00:00Z",
      };

      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockLog),
      };

      const mockInsertStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT")) {
          return mockSelectStmt;
        }
        if (query.includes("INSERT")) {
          return mockInsertStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(undefined),
        };
      });

      vi.mocked(sendFCMNotificationWithLogs).mockResolvedValue({
        success: true,
        logs: [],
        messageId: "new-message-id",
      });

      await retryNotification("log-1", mockEnv, mockLogger);

      // Should create new log entry with attempt_count = 1 (always starts at 1 for new retry)
      expect(mockInsertStmt.bind).toHaveBeenCalledWith(
        expect.stringContaining("retry"),
        mockLog.alert_id,
        mockLog.symbol,
        mockLog.threshold,
        mockLog.price,
        mockLog.direction,
        mockLog.push_token,
        "success",
        null,
        1, // attempt_count always starts at 1 for new retry log entry
        expect.any(String)
      );
    });

    it("should handle database errors during retry", async () => {
      const mockLog = {
        id: "log-1",
        alert_id: "alert-1",
        symbol: "AAPL",
        threshold: 200,
        price: 205,
        direction: "above",
        push_token: "fcm-token-1",
        status: "failed",
        error_message: "Previous error",
        attempt_count: 1,
        sent_at: "2025-01-01T00:00:00Z",
      };

      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockLog),
      };

      const mockUpdateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT")) {
          return mockSelectStmt;
        }
        return mockUpdateStmt;
      });

      vi.mocked(sendFCMNotificationWithLogs).mockResolvedValue({
        success: true,
        logs: [],
        messageId: "new-message-id",
      });

      const response = await retryNotification("log-1", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain("Failed to retry notification");
    });

    it("should handle FCM send errors", async () => {
      const mockLog = {
        id: "log-1",
        alert_id: "alert-1",
        symbol: "AAPL",
        threshold: 200,
        price: 205,
        direction: "above",
        push_token: "fcm-token-1",
        status: "failed",
        error_message: "Previous error",
        attempt_count: 1,
        sent_at: "2025-01-01T00:00:00Z",
      };

      const mockSelectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockLog),
      };

      const mockInsertStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.prepare.mockImplementation((query: string) => {
        if (query.includes("SELECT")) {
          return mockSelectStmt;
        }
        if (query.includes("INSERT")) {
          return mockInsertStmt;
        }
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(undefined),
        };
      });

      vi.mocked(sendFCMNotificationWithLogs).mockRejectedValue(new Error("FCM error"));

      const response = await retryNotification("log-1", mockEnv, mockLogger);
      const data = await response.json();

      // FCM errors are caught and logged, but function returns 200 with success: false
      // 500 is only returned for outer exceptions (like database errors)
      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.errorMessage).toContain("FCM error");
    });
  });
});

