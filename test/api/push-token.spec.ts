import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerPushToken, getPushToken } from "../../src/api/push-token";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";

describe("Push Token API", () => {
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
    } as Env;

    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  describe("registerPushToken", () => {
    it("should return error if method is not POST", async () => {
      const request = new Request("https://example.com", {
        method: "GET",
      });

      const response = await registerPushToken(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data).toEqual({ error: "Method not allowed" });
    });

    it("should return error if JSON is invalid", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: "invalid json",
      });

      const response = await registerPushToken(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: "Invalid JSON payload" });
    });

    it("should return error if userId is missing", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({ token: "fcm-token-123" }),
      });

      const response = await registerPushToken(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: "userId is required" });
    });

    it("should return error if userId is empty string", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({ userId: "", token: "fcm-token-123" }),
      });

      const response = await registerPushToken(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: "userId is required" });
    });

    it("should return error if token is missing", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({ userId: "user-123" }),
      });

      const response = await registerPushToken(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: "token is required" });
    });

    it("should reject old Expo tokens", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          token: "ExponentPushToken[abc123]",
        }),
      });

      const response = await registerPushToken(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Expo push tokens are no longer supported");
    });

    it("should reject tokens that are too short", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          token: "short", // Less than 20 characters
        }),
      });

      const response = await registerPushToken(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("token too short");
    });

    it("should reject tokens with invalid characters", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          token: "invalid@token#with$special%chars!",
        }),
      });

      const response = await registerPushToken(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid FCM token format");
    });

    it("should accept valid FCM token with alphanumeric, hyphens, underscores, colons, and dots", async () => {
      const validTokens = [
        "abcdefghijklmnopqrstuvwxyz1234567890",
        "abc-def-ghi-jkl-mno-pqr-stu-vwx-yz-123",
        "abc_def_ghi_jkl_mno_pqr_stu_vwx_yz_123",
        "abc:def:ghi:jkl:mno:pqr:stu:vwx:yz:123",
        "abc.def.ghi.jkl.mno.pqr.stu.vwx.yz.123",
        "mixed-abc_def:ghi.jkl123456789",
      ];

      for (const token of validTokens) {
        const request = new Request("https://example.com", {
          method: "POST",
          body: JSON.stringify({
            userId: "user-123",
            token: token,
          }),
        });

        const checkStmt = {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
        };

        const insertStmt = {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true }),
        };

        mockDb.prepare
          .mockReturnValueOnce(checkStmt)
          .mockReturnValueOnce(insertStmt);

        const response = await registerPushToken(request, mockEnv, mockLogger);
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(insertStmt.bind).toHaveBeenCalledWith(
          "user-123",
          token,
          null,
          expect.any(String),
          expect.any(String)
        );
      }
    });

    it("should create new token if user doesn't exist", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          token: "fcm-token-12345678901234567890",
          deviceInfo: "iPhone 13",
        }),
      });

      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null), // User doesn't exist
      };

      const insertStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare
        .mockReturnValueOnce(checkStmt)
        .mockReturnValueOnce(insertStmt);

      const response = await registerPushToken(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual({
        success: true,
        message: "Push token registered",
        userId: "user-123",
      });
      expect(insertStmt.bind).toHaveBeenCalledWith(
        "user-123",
        "fcm-token-12345678901234567890",
        "iPhone 13",
        expect.any(String), // created_at
        expect.any(String) // updated_at
      );
    });

    it("should update existing token if user exists", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          token: "new-fcm-token-12345678901234567890",
          deviceInfo: "iPhone 14",
        }),
      });

      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ user_id: "user-123" }), // User exists
      };

      const updateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare
        .mockReturnValueOnce(checkStmt)
        .mockReturnValueOnce(updateStmt);

      const response = await registerPushToken(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        message: "Push token updated",
        userId: "user-123",
      });
      expect(updateStmt.bind).toHaveBeenCalledWith(
        "new-fcm-token-12345678901234567890",
        "iPhone 14",
        expect.any(String), // updated_at
        "user-123"
      );
    });

    it("should handle null deviceInfo", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          token: "fcm-token-12345678901234567890",
        }),
      });

      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      const insertStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare
        .mockReturnValueOnce(checkStmt)
        .mockReturnValueOnce(insertStmt);

      const response = await registerPushToken(request, mockEnv, mockLogger);

      expect(response.status).toBe(201);
      expect(insertStmt.bind).toHaveBeenCalledWith(
        "user-123",
        "fcm-token-12345678901234567890",
        null,
        expect.any(String),
        expect.any(String)
      );
    });

    it("should handle database errors", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          token: "fcm-token-12345678901234567890",
        }),
      });

      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      mockDb.prepare.mockReturnValue(checkStmt);

      const response = await registerPushToken(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: "Failed to register push token" });
    });
  });

  describe("getPushToken", () => {
    it("should return error if userId is missing", async () => {
      const response = await getPushToken("", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: "userId is required" });
    });

    it("should return push token if found", async () => {
      const mockRow = {
        user_id: "user-123",
        push_token: "fcm-token-12345678901234567890",
        device_info: "iPhone 13",
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-02T00:00:00.000Z",
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockRow),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getPushToken("user-123", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        userId: "user-123",
        pushToken: "fcm-token-12345678901234567890",
        deviceInfo: "iPhone 13",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
      });
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("SELECT user_id, push_token")
      );
      expect(mockStmt.bind).toHaveBeenCalledWith("user-123");
    });

    it("should return 404 if token not found", async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getPushToken("user-123", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: "Push token not found" });
    });

    it("should handle null deviceInfo", async () => {
      const mockRow = {
        user_id: "user-123",
        push_token: "fcm-token-12345678901234567890",
        device_info: null,
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-02T00:00:00.000Z",
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockRow),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getPushToken("user-123", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.deviceInfo).toBeNull();
    });

    it("should handle database errors", async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockRejectedValue(new Error("Database error")),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getPushToken("user-123", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: "Failed to get push token" });
    });
  });
});

