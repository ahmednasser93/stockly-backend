import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSettings, updateSettings, type UserSettings } from "../../src/api/settings";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";

describe("Settings API", () => {
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

  describe("getSettings", () => {
    it("should return error if userId is missing", async () => {
      const response = await getSettings("", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: "userId is required" });
    });

    it("should return user settings if found", async () => {
      const mockRow = {
        user_id: "user-123",
        refresh_interval_minutes: 10,
        cache_stale_time_minutes: 8,
        cache_gc_time_minutes: 15,
        updated_at: "2025-01-01T00:00:00.000Z",
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockRow),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getSettings("user-123", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        userId: "user-123",
        refreshIntervalMinutes: 10,
        cacheStaleTimeMinutes: 8,
        cacheGcTimeMinutes: 15,
        updatedAt: "2025-01-01T00:00:00.000Z",
      });
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("SELECT user_id, refresh_interval_minutes, cache_stale_time_minutes, cache_gc_time_minutes")
      );
      expect(mockStmt.bind).toHaveBeenCalledWith("user-123");
    });

    it("should return default cache settings when null", async () => {
      const mockRow = {
        user_id: "user-123",
        refresh_interval_minutes: 10,
        cache_stale_time_minutes: null,
        cache_gc_time_minutes: null,
        updated_at: "2025-01-01T00:00:00.000Z",
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockRow),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getSettings("user-123", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        userId: "user-123",
        refreshIntervalMinutes: 10,
        cacheStaleTimeMinutes: 5, // Default
        cacheGcTimeMinutes: 10, // Default
        updatedAt: "2025-01-01T00:00:00.000Z",
      });
    });

    it("should return default settings if not found", async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getSettings("user-123", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        userId: "user-123",
        refreshIntervalMinutes: 5, // Default value
        cacheStaleTimeMinutes: 5, // Default value
        cacheGcTimeMinutes: 10, // Default value
        updatedAt: expect.any(String),
      });
    });

    it("should handle database errors", async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockRejectedValue(new Error("Database error")),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getSettings("user-123", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: "Failed to retrieve settings" });
    });
  });

  describe("updateSettings", () => {
    it("should return error if userId is missing", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({ refreshIntervalMinutes: 10 }),
      });

      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error: "userId is required and must be a string",
      });
    });

    it("should return error if refreshIntervalMinutes is missing", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({ userId: "user-123" }),
      });

      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error: "refreshIntervalMinutes is required",
      });
    });

    it("should return error if refreshIntervalMinutes is less than 1", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 0,
        }),
      });

      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error:
          "refreshIntervalMinutes must be a number between 1 and 720 (minutes)",
      });
    });

    it("should return error if refreshIntervalMinutes is greater than 720", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 721,
        }),
      });

      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error:
          "refreshIntervalMinutes must be a number between 1 and 720 (minutes)",
      });
    });

    it("should return error if refreshIntervalMinutes cannot be converted to valid number", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: "abc", // Invalid number string
        }),
      });

      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error:
          "refreshIntervalMinutes must be a number between 1 and 720 (minutes)",
      });
    });

    it("should accept numeric string that can be converted to valid number", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: "10", // String that converts to number
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

      const response = await updateSettings(request, mockEnv, mockLogger);

      // Should succeed because "10" converts to 10
      expect(response.status).toBe(201);
    });

    it("should round refreshIntervalMinutes to nearest integer", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 10.7,
        }),
      });

      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ user_id: "user-123" }),
      };

      const updateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare
        .mockReturnValueOnce(checkStmt)
        .mockReturnValueOnce(updateStmt);

      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.settings.refreshIntervalMinutes).toBe(11);
      expect(updateStmt.bind).toHaveBeenCalledWith(
        11, // Rounded value
        null, // cache_stale_time_minutes
        null, // cache_gc_time_minutes
        expect.any(String),
        "user-123"
      );
    });

    it("should create new settings if user doesn't exist", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 15,
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

      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual({
        success: true,
        message: "Settings created",
        settings: {
          userId: "user-123",
          refreshIntervalMinutes: 15,
          cacheStaleTimeMinutes: 5,
          cacheGcTimeMinutes: 10,
          updatedAt: expect.any(String),
        },
      });
      expect(insertStmt.bind).toHaveBeenCalledWith(
        "user-123",
        15,
        null, // cache_stale_time_minutes
        null, // cache_gc_time_minutes
        expect.any(String) // updated_at
      );
    });

    it("should update existing settings", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 30,
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

      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        message: "Settings updated",
        settings: {
          userId: "user-123",
          refreshIntervalMinutes: 30,
          cacheStaleTimeMinutes: 5,
          cacheGcTimeMinutes: 10,
          updatedAt: expect.any(String),
        },
      });
      expect(updateStmt.bind).toHaveBeenCalledWith(
        30,
        null, // cache_stale_time_minutes
        null, // cache_gc_time_minutes
        expect.any(String), // updated_at
        "user-123"
      );
    });

    it("should handle boundary values", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 1, // Minimum valid value
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

      const response = await updateSettings(request, mockEnv, mockLogger);

      expect(response.status).toBe(201);
      expect(insertStmt.bind).toHaveBeenCalledWith(
        "user-123",
        1,
        null, // cache_stale_time_minutes
        null, // cache_gc_time_minutes
        expect.any(String)
      );
    });

    it("should handle maximum valid value (720)", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 720, // Maximum valid value
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

      const response = await updateSettings(request, mockEnv, mockLogger);

      expect(response.status).toBe(201);
      expect(insertStmt.bind).toHaveBeenCalledWith(
        "user-123",
        720,
        null, // cache_stale_time_minutes
        null, // cache_gc_time_minutes
        expect.any(String)
      );
    });

    it("should handle database errors", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 10,
        }),
      });

      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      mockDb.prepare.mockReturnValue(checkStmt);

      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: "Failed to update settings" });
    });

    it("should handle invalid JSON in request body", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: "invalid json",
      });

      // The function has a try-catch, so JSON parse errors will be caught
      // and return a 500 error response
      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: "Failed to update settings" });
    });

    it("should update cache settings when provided", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 20,
          cacheStaleTimeMinutes: 8,
          cacheGcTimeMinutes: 15,
        }),
      });

      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ user_id: "user-123" }),
      };

      const updateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare
        .mockReturnValueOnce(checkStmt)
        .mockReturnValueOnce(updateStmt);

      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.settings).toEqual({
        userId: "user-123",
        refreshIntervalMinutes: 20,
        cacheStaleTimeMinutes: 8,
        cacheGcTimeMinutes: 15,
        updatedAt: expect.any(String),
      });
      expect(updateStmt.bind).toHaveBeenCalledWith(
        20,
        8,
        15,
        expect.any(String),
        "user-123"
      );
    });

    it("should validate cache stale time range (0-60)", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 10,
          cacheStaleTimeMinutes: 61, // Invalid: > 60
        }),
      });

      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("cacheStaleTimeMinutes must be between 0 and 60");
    });

    it("should validate cache GC time range (1-120)", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 10,
          cacheGcTimeMinutes: 121, // Invalid: > 120
        }),
      });

      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("cacheGcTimeMinutes must be between 1 and 120");
    });

    it("should accept cache stale time of 0 (minimum)", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 10,
          cacheStaleTimeMinutes: 0,
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

      const response = await updateSettings(request, mockEnv, mockLogger);

      expect(response.status).toBe(201);
      expect(insertStmt.bind).toHaveBeenCalledWith(
        "user-123",
        10,
        0, // cache_stale_time_minutes
        null, // cache_gc_time_minutes
        expect.any(String)
      );
    });

    it("should accept cache GC time of 1 (minimum)", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 10,
          cacheGcTimeMinutes: 1,
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

      const response = await updateSettings(request, mockEnv, mockLogger);

      expect(response.status).toBe(201);
      expect(insertStmt.bind).toHaveBeenCalledWith(
        "user-123",
        10,
        null, // cache_stale_time_minutes
        1, // cache_gc_time_minutes
        expect.any(String)
      );
    });

    it("should round cache settings to nearest integer", async () => {
      const request = new Request("https://example.com", {
        method: "PUT",
        body: JSON.stringify({
          userId: "user-123",
          refreshIntervalMinutes: 10,
          cacheStaleTimeMinutes: 5.7,
          cacheGcTimeMinutes: 10.3,
        }),
      });

      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ user_id: "user-123" }),
      };

      const updateStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare
        .mockReturnValueOnce(checkStmt)
        .mockReturnValueOnce(updateStmt);

      const response = await updateSettings(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.settings.cacheStaleTimeMinutes).toBe(6); // Rounded
      expect(data.settings.cacheGcTimeMinutes).toBe(10); // Rounded
      expect(updateStmt.bind).toHaveBeenCalledWith(
        10,
        6, // Rounded
        10, // Rounded
        expect.any(String),
        "user-123"
      );
    });
  });
});
