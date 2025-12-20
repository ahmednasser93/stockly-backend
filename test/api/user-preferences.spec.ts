/**
 * User Preferences API Tests
 * 
 * Comprehensive tests for user preferences endpoints
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { updateUserPreferences } from "../../src/api/user-preferences";
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

describe("User Preferences API", () => {
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

  describe("updateUserPreferences", () => {
    it("should update news favorite symbols", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;

      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-123" }),
      };

      // Mock settings check
      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ username: "testuser" }),
      };

      // Mock update
      const updateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare
        .mockReturnValueOnce(userStmt)
        .mockReturnValueOnce(checkStmt)
        .mockReturnValueOnce(updateStmt);

      const request = createMockRequest("/v1/api/user-preferences", {
        method: "PUT",
        body: {
          newsFavoriteSymbols: ["AAPL", "GOOGL", "MSFT"],
        },
      });

      const response = await updateUserPreferences(request, mockEnv, mockLogger);
      expect(response.status).toBe(200);
    });

    it("should create settings if they don't exist", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;

      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-123" }),
      };

      // Mock settings check (not found)
      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      // Mock insert
      const insertStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare
        .mockReturnValueOnce(userStmt)
        .mockReturnValueOnce(checkStmt)
        .mockReturnValueOnce(insertStmt);

      const request = createMockRequest("/v1/api/user-preferences", {
        method: "PUT",
        body: {
          newsFavoriteSymbols: ["AAPL"],
        },
      });

      const response = await updateUserPreferences(request, mockEnv, mockLogger);
      expect(response.status).toBe(200);
    });

    it("should validate symbols array", async () => {
      const request = createMockRequest("/v1/api/user-preferences", {
        method: "PUT",
        body: {
          newsFavoriteSymbols: "not-an-array",
        },
      });

      // Mock authentication
      vi.mock("../../src/auth/middleware", () => ({
        authenticateRequest: vi.fn().mockResolvedValue({
          username: "testuser",
          userId: "user-123",
          tokenType: "access" as const,
          isAdmin: false,
        }),
      }));

      const response = await updateUserPreferences(request, mockEnv, mockLogger);
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});





