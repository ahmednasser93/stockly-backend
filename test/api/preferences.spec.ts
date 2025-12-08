import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getPreferences,
  updatePreferences,
  type NotificationPreferences,
} from "../../src/api/preferences";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";

describe("Preferences API", () => {
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

  describe("getPreferences", () => {
    it("should return error if userId is missing", async () => {
      const response = await getPreferences("", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: "userId is required" });
    });

    it("should return user preferences if found", async () => {
      const mockRow = {
        user_id: "user-123",
        enabled: 1,
        quiet_start: "22:00",
        quiet_end: "08:00",
        allowed_symbols: "AAPL,MSFT,GOOGL",
        max_daily: 10,
        updated_at: "2025-01-01T00:00:00.000Z",
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockRow),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getPreferences("user-123", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        userId: "user-123",
        enabled: true,
        quietStart: "22:00",
        quietEnd: "08:00",
        allowedSymbols: ["AAPL", "MSFT", "GOOGL"],
        maxDaily: 10,
        updatedAt: "2025-01-01T00:00:00.000Z",
      });
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("SELECT user_id, enabled, quiet_start")
      );
      expect(mockStmt.bind).toHaveBeenCalledWith("user-123");
    });

    it("should return default preferences if not found", async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getPreferences("user-123", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        userId: "user-123",
        enabled: true,
        quietStart: null,
        quietEnd: null,
        allowedSymbols: null,
        maxDaily: null,
        updatedAt: expect.any(String),
      });
    });

    it("should handle null values in database", async () => {
      const mockRow = {
        user_id: "user-123",
        enabled: 0,
        quiet_start: null,
        quiet_end: null,
        allowed_symbols: null,
        max_daily: null,
        updated_at: "2025-01-01T00:00:00.000Z",
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockRow),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getPreferences("user-123", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        userId: "user-123",
        enabled: false,
        quietStart: null,
        quietEnd: null,
        allowedSymbols: null,
        maxDaily: null,
        updatedAt: "2025-01-01T00:00:00.000Z",
      });
    });

    it("should handle database errors", async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockRejectedValue(new Error("Database error")),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getPreferences("user-123", mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: "Failed to retrieve preferences" });
    });

    it("should parse empty allowed_symbols string as null", async () => {
      const mockRow = {
        user_id: "user-123",
        enabled: 1,
        quiet_start: null,
        quiet_end: null,
        allowed_symbols: "", // Empty string is falsy, so will return null
        max_daily: null,
        updated_at: "2025-01-01T00:00:00.000Z",
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockRow),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const response = await getPreferences("user-123", mockEnv, mockLogger);
      const data = await response.json();

      // Empty string is falsy in JavaScript, so the ternary returns null
      expect(data.allowedSymbols).toBeNull();
    });
  });

  describe("updatePreferences", () => {
    it("should return error if userId is missing", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({ enabled: true }),
      });

      const response = await updatePreferences(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error: "userId is required and must be a string",
      });
    });

    it("should return error if enabled is not boolean", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({ userId: "user-123", enabled: "true" }),
      });

      const response = await updatePreferences(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: "enabled must be a boolean" });
    });

    it("should return error if quietStart is invalid", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          enabled: true,
          quietStart: 123,
        }),
      });

      const response = await updatePreferences(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error: "quietStart must be a string (HH:MM format)",
      });
    });

    it("should return error if quietEnd is invalid", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          enabled: true,
          quietEnd: 456,
        }),
      });

      const response = await updatePreferences(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error: "quietEnd must be a string (HH:MM format)",
      });
    });

    it("should return error if maxDaily is negative", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          enabled: true,
          maxDaily: -1,
        }),
      });

      const response = await updatePreferences(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error: "maxDaily must be a non-negative number",
      });
    });

    it("should return error if allowedSymbols is not array", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          enabled: true,
          allowedSymbols: "AAPL,MSFT",
        }),
      });

      const response = await updatePreferences(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: "allowedSymbols must be an array" });
    });

    it("should create new preferences if user doesn't exist", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          enabled: true,
          quietStart: "22:00",
          quietEnd: "08:00",
          allowedSymbols: ["AAPL", "MSFT"],
          maxDaily: 10,
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

      const response = await updatePreferences(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual({
        success: true,
        message: "Preferences created",
      });
      expect(insertStmt.bind).toHaveBeenCalledWith(
        "user-123",
        1, // enabled
        "22:00",
        "08:00",
        "AAPL,MSFT",
        10,
        expect.any(String) // updated_at
      );
    });

    it("should update existing preferences", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          enabled: false,
          quietStart: "23:00",
          quietEnd: "07:00",
          allowedSymbols: ["GOOGL"],
          maxDaily: 5,
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

      const response = await updatePreferences(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        message: "Preferences updated",
      });
      expect(updateStmt.bind).toHaveBeenCalledWith(
        0, // enabled (false)
        "23:00",
        "07:00",
        "GOOGL",
        5,
        expect.any(String), // updated_at
        "user-123"
      );
    });

    it("should handle null values correctly", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          enabled: true,
          quietStart: null,
          quietEnd: null,
          allowedSymbols: null,
          maxDaily: null,
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

      const response = await updatePreferences(request, mockEnv, mockLogger);

      expect(response.status).toBe(200);
      expect(updateStmt.bind).toHaveBeenCalledWith(
        1, // enabled
        null,
        null,
        null,
        null,
        expect.any(String),
        "user-123"
      );
    });

    it("should handle database errors", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          enabled: true,
        }),
      });

      const checkStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      mockDb.prepare.mockReturnValue(checkStmt);

      const response = await updatePreferences(request, mockEnv, mockLogger);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: "Failed to update preferences" });
    });

    it("should allow maxDaily to be zero", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          enabled: true,
          maxDaily: 0,
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

      const response = await updatePreferences(request, mockEnv, mockLogger);

      expect(response.status).toBe(201);
      expect(insertStmt.bind).toHaveBeenCalledWith(
        "user-123",
        1,
        null,
        null,
        null,
        0,
        expect.any(String)
      );
    });

    it("should handle empty allowedSymbols array", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-123",
          enabled: true,
          allowedSymbols: [],
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

      const response = await updatePreferences(request, mockEnv, mockLogger);

      expect(response.status).toBe(200);
      // Empty array should result in empty string
      expect(updateStmt.bind).toHaveBeenCalledWith(
        1,
        null,
        null,
        "",
        null,
        expect.any(String),
        "user-123"
      );
    });
  });
});
