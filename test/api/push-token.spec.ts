/**
 * Push Token API Tests
 * 
 * Comprehensive tests for push token registration endpoints
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerPushToken, getPushToken } from "../../src/api/push-token";
import type { Env } from "../../src/index";
import {
  createMockEnv,
  createMockRequest,
  createMockLogger,
} from "../test-utils";
import { createMockD1Database } from "../utils/factories";
import * as authMiddleware from "../../src/auth/middleware";

vi.mock("../../src/auth/middleware", () => ({
  authenticateRequest: vi.fn(),
  authenticateRequestWithAdmin: vi.fn(),
}));

describe("Push Token API", () => {
  let mockEnv: Env;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
    
    // Default mock for authentication
    vi.mocked(authMiddleware.authenticateRequest).mockResolvedValue({
      username: "testuser",
      userId: "user-123",
      tokenType: "access" as const,
      isAdmin: false,
    });
  });

  describe("registerPushToken", () => {
    it("should register new push token", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;


      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-123", username: "testuser" }),
      };

      // Mock token check (not found)
      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      // Mock insert (with device_type - succeeds on first try)
      const insertStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      // Mock select after insert (verification query)
      const selectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          user_id: "user-123",
          username: "testuser",
          push_token: "fcm-token-12345678901234567890",
          device_info: "Test Device",
          device_type: "android",
        }),
      };

      mockDb.prepare
        .mockReturnValueOnce(userStmt)      // User lookup
        .mockReturnValueOnce(checkStmt)     // Token check (not found)
        .mockReturnValueOnce(insertStmt)    // Insert new token
        .mockReturnValueOnce(selectStmt);    // Verify after insert

      const request = createMockRequest("/v1/api/push-token", {
        method: "POST",
        body: {
          token: "fcm-token-12345678901234567890",
          deviceInfo: "Test Device",
          deviceType: "android",
        },
      });

      const response = await registerPushToken(request, mockEnv, mockLogger);
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("should update existing push token", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;


      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-123", username: "testuser" }),
      };

      // Mock token check (found, same user)
      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          id: 1,
          user_id: "user-123",
        }),
      };

      // Mock update
      const updateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      // Mock select after update (verification query)
      const selectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          user_id: "user-123",
          username: "testuser",
          push_token: "fcm-token-12345678901234567890",
          device_info: "Updated Device",
          device_type: "android",
        }),
      };

      mockDb.prepare
        .mockReturnValueOnce(userStmt)      // User lookup
        .mockReturnValueOnce(checkStmt)     // Token check (found, same user)
        .mockReturnValueOnce(updateStmt)    // Update token
        .mockReturnValueOnce(selectStmt);    // Verify after update

      const request = createMockRequest("/v1/api/push-token", {
        method: "POST",
        body: {
          token: "fcm-token-12345678901234567890",
          deviceInfo: "Updated Device",
          deviceType: "android",
        },
      });

      const response = await registerPushToken(request, mockEnv, mockLogger);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toContain("updated");
    });

    it("should reassign token to new user if different user", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;


      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-123", username: "testuser" }),
      };

      // Mock token check (found, different user)
      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          id: 1,
          user_id: "user-456", // Different user
        }),
      };

      // Mock update
      const updateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      // Mock select after update (verification query)
      const selectStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          user_id: "user-123",
          username: "testuser",
          push_token: "fcm-token-12345678901234567890",
          device_info: "Test Device",
          device_type: "android",
        }),
      };

      mockDb.prepare
        .mockReturnValueOnce(userStmt)      // User lookup
        .mockReturnValueOnce(checkStmt)     // Token check (found, different user)
        .mockReturnValueOnce(updateStmt)    // Update/reassign token
        .mockReturnValueOnce(selectStmt);    // Verify after update

      const request = createMockRequest("/v1/api/push-token", {
        method: "POST",
        body: {
          token: "fcm-token-12345678901234567890",
          deviceInfo: "Test Device",
          deviceType: "android",
        },
      });

      const response = await registerPushToken(request, mockEnv, mockLogger);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toContain("reassigned");
    });

    it("should validate token format", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;


      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-123", username: "testuser" }),
      };

      mockDb.prepare.mockReturnValue(userStmt);

      const request = createMockRequest("/v1/api/push-token", {
        method: "POST",
        body: {
          token: "", // Empty token
          deviceInfo: "Test Device",
        },
      });

      const response = await registerPushToken(request, mockEnv, mockLogger);
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("getPushToken", () => {
    it("should return push tokens for authenticated user", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;


      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-123", username: "testuser" }),
      };

      // Mock tokens query
      const tokensStmt = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({
          results: [
            {
              user_id: "user-123",
              push_token: "token-1",
              device_info: "Device 1",
              device_type: "android",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      };

      mockDb.prepare
        .mockReturnValueOnce(userStmt)
        .mockReturnValueOnce(tokensStmt);

      const request = createMockRequest("/v1/api/push-token");
      const response = await getPushToken(request, mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.devices).toBeDefined();
      expect(Array.isArray(data.devices)).toBe(true);
    });
  });
});

