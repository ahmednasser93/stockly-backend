/**
 * Settings API Tests
 * 
 * Comprehensive tests for user settings endpoints
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSettings, updateSettings } from "../../src/api/settings";
import type { Env } from "../../src/index";
import {
  createMockEnv,
  createMockRequest,
  createMockLogger,
} from "../test-utils";
import { createMockD1Database } from "../utils/factories";

describe("Settings API", () => {
  let mockEnv: Env;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  describe("getSettings", () => {
    it("should return settings for authenticated user", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;

      // Mock authentication
      vi.mock("../../src/auth/middleware", () => ({
        authenticateRequest: vi.fn().mockResolvedValue({
          username: "testuser",
          userId: "user-123",
          tokenType: "access" as const,
          isAdmin: false,
        }),
      }));

      // Mock settings query
      const stmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          username: "testuser",
          refresh_interval_minutes: 30,
          cache_stale_time_minutes: 5,
          cache_gc_time_minutes: 10,
          news_favorite_symbols: '["AAPL", "GOOGL"]',
          updated_at: new Date().toISOString(),
        }),
      };

      mockDb.prepare.mockReturnValue(stmt);

      const request = createMockRequest("/v1/api/settings");
      const response = await getSettings(request, mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.refreshIntervalMinutes).toBe(30);
    });

    it("should return default settings if none exist", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;

      // Mock authentication
      vi.mock("../../src/auth/middleware", () => ({
        authenticateRequest: vi.fn().mockResolvedValue({
          username: "testuser",
          userId: "user-123",
          tokenType: "access" as const,
          isAdmin: false,
        }),
      }));

      // Mock empty settings
      const stmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };

      mockDb.prepare.mockReturnValue(stmt);

      const request = createMockRequest("/v1/api/settings");
      const response = await getSettings(request, mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      // Should return default values
      expect(data).toBeDefined();
    });
  });

  describe("updateSettings", () => {
    it("should update settings for authenticated user", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;

      // Mock authentication
      vi.mock("../../src/auth/middleware", () => ({
        authenticateRequest: vi.fn().mockResolvedValue({
          username: "testuser",
          userId: "user-123",
          tokenType: "access" as const,
          isAdmin: false,
        }),
      }));

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

      const request = createMockRequest("/v1/api/settings", {
        method: "PUT",
        body: {
          refreshIntervalMinutes: 45,
          cacheStaleTimeMinutes: 10,
        },
      });

      const response = await updateSettings(request, mockEnv, mockLogger);
      expect(response.status).toBe(200);
    });

    it("should create settings if they don't exist", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;

      // Mock authentication
      vi.mock("../../src/auth/middleware", () => ({
        authenticateRequest: vi.fn().mockResolvedValue({
          username: "testuser",
          userId: "user-123",
          tokenType: "access" as const,
          isAdmin: false,
        }),
      }));

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

      const request = createMockRequest("/v1/api/settings", {
        method: "PUT",
        body: {
          refreshIntervalMinutes: 45,
        },
      });

      const response = await updateSettings(request, mockEnv, mockLogger);
      expect(response.status).toBe(201); // 201 Created for new settings
    });
  });
});
