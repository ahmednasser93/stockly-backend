import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getRecentNotifications,
  getFailedNotifications,
  getFilteredNotifications,
  retryNotification,
} from "../../src/api/admin";
import { sendFCMNotificationWithLogs } from "../../src/notifications/fcm-sender";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";
import * as authMiddleware from "../../src/auth/middleware";

vi.mock("../../src/notifications/fcm-sender", () => ({
  sendFCMNotificationWithLogs: vi.fn(),
}));

vi.mock("../../src/auth/middleware", () => ({
  authenticateRequestWithAdmin: vi.fn(),
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

    // Default mock for admin authentication
    vi.mocked(authMiddleware.authenticateRequestWithAdmin).mockResolvedValue({
      username: "admin",
      userId: "admin-123",
      tokenType: "access" as const,
      isAdmin: true,
    });
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

      const request = new Request("https://example.com/v1/api/notifications/recent");
      const response = await getRecentNotifications(request, mockEnv, mockLogger);
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
        expect.stringContaining("SELECT")
      );
    });

    it("should return empty array when no notifications", async () => {
      const mockStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const request = new Request("https://example.com/v1/api/notifications/recent");
      const response = await getRecentNotifications(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.notifications).toEqual([]);
    });

    it("should handle database errors", async () => {
      const mockStmt = {
        all: vi.fn().mockRejectedValue(new Error("Database error")),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const request = new Request("https://example.com/v1/api/notifications/recent");
      const response = await getRecentNotifications(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to retrieve recent notifications");
    });

    it("should limit to 100 notifications", async () => {
      const mockStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const request = new Request("https://example.com/v1/api/notifications/recent");
      await getRecentNotifications(request, mockEnv, mockLogger);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 100")
      );
    });

    it("should order by sent_at DESC", async () => {
      const mockStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const request = new Request("https://example.com/v1/api/notifications/recent");
      await getRecentNotifications(request, mockEnv, mockLogger);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY nl.sent_at DESC")
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

      const request = new Request("https://example.com/v1/api/notifications/failed");
      const response = await getFailedNotifications(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.notifications).toHaveLength(2);
      expect(data.notifications[0].status).toBe("failed");
      expect(data.notifications[1].status).toBe("error");
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("WHERE nl.status IN ('failed', 'error')")
      );
    });

    it("should return empty array when no failed notifications", async () => {
      const mockStmt = {
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const request = new Request("https://example.com/v1/api/notifications/failed");
      const response = await getFailedNotifications(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.notifications).toEqual([]);
    });

    it("should handle database errors", async () => {
      const mockStmt = {
        all: vi.fn().mockRejectedValue(new Error("Database error")),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const request = new Request("https://example.com/v1/api/notifications/failed");
      const response = await getFailedNotifications(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to retrieve failed notifications");
    });
  });

  describe("getFilteredNotifications", () => {
    it("should return filtered notifications", async () => {
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
          username: "testuser",
        },
      ];

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: mockNotifications }),
      };

      mockDb.prepare.mockReturnValue(mockStmt);

      const request = new Request("https://example.com/v1/api/notifications/filter?symbol=AAPL&status=success");
      const response = await getFilteredNotifications(
        request,
        "AAPL",
        "success",
        undefined,
        undefined,
        mockEnv
      );

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.notifications).toHaveLength(1);
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("WHERE 1=1 AND symbol = ? AND status = ?"));
      expect(mockStmt.bind).toHaveBeenCalledWith("AAPL", "success");
    });

    it("should filter by date range", async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const request = new Request("https://example.com/v1/api/notifications/filter");
      await getFilteredNotifications(
        request,
        undefined,
        undefined,
        "2023-01-01",
        "2023-01-31",
        mockEnv
      );

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("AND sent_at >= ? AND sent_at <= ?"));
      expect(mockStmt.bind).toHaveBeenCalledWith("2023-01-01", "2023-01-31");
    });

    it("should fail if env not provided", async () => {
      const request = new Request("https://example.com/v1/api/notifications/filter");
      const response = await getFilteredNotifications(request);
      expect(response.status).toBe(500);
    });

    it("should handle db errors", async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error("DB Error");
      });

      const request = new Request("https://example.com/v1/api/notifications/filter");
      const response = await getFilteredNotifications(request, undefined, undefined, undefined, undefined, mockEnv);

      expect(response.status).toBe(500);
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

      const request = new Request("https://example.com/v1/api/notifications/retry/log-1");
      const response = await retryNotification(request, "log-1", mockEnv, mockLogger);
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

      const request = new Request("https://example.com/v1/api/notifications/retry/non-existent");
      const response = await retryNotification(request, "non-existent", mockEnv, mockLogger);
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

      const request = new Request("https://example.com/v1/api/notifications/retry/log-1");
      const response = await retryNotification(request, "log-1", mockEnv, mockLogger);
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
        username: "testuser",
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

      const request = new Request("https://example.com/v1/api/notifications/retry/log-1");
      await retryNotification(request, "log-1", mockEnv, mockLogger);

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
        mockLog.username,
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

      const request = new Request("https://example.com/v1/api/notifications/retry/log-1");
      const response = await retryNotification(request, "log-1", mockEnv, mockLogger);
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

      const request = new Request("https://example.com/v1/api/notifications/retry/log-1");
      const response = await retryNotification(request, "log-1", mockEnv, mockLogger);
      const data = await response.json();

      // FCM errors are caught and logged, but function returns 200 with success: false
      // 500 is only returned for outer exceptions (like database errors)
      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.errorMessage).toContain("FCM error");
    });
  });
});

