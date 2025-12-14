/**
 * Favorite Stocks API Tests
 * 
 * Comprehensive tests for favorite stocks endpoints
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getFavoriteStocks,
  updateFavoriteStocks,
  deleteFavoriteStock,
} from "../../src/api/favorite-stocks";
import type { Env } from "../../src/index";
import {
  createMockEnv,
  createMockRequest,
  createMockLogger,
} from "../test-utils";
import { createMockD1Database } from "../utils/factories";

vi.mock("../../src/auth/middleware", () => ({
  authenticateRequest: vi.fn(),
}));

import { authenticateRequest } from "../../src/auth/middleware";

describe("Favorite Stocks API", () => {
  let mockEnv: Env;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockLogger = createMockLogger();
    vi.clearAllMocks();
    // Default auth mock
    vi.mocked(authenticateRequest).mockResolvedValue({
      username: "testuser",
      tokenType: "access" as const,
    });
  });

  describe("getFavoriteStocks", () => {
    it("should return favorite stocks for authenticated user", async () => {
      // Mock favorite stocks query - bind must return an object with all()
      const allResult = {
        results: [
          { symbol: "AAPL", display_order: 0, created_at: Date.now() / 1000, updated_at: Date.now() / 1000 },
          { symbol: "GOOGL", display_order: 1, created_at: Date.now() / 1000, updated_at: Date.now() / 1000 },
        ],
      };

      const stocksStmt = {
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue(allResult),
        }),
        all: vi.fn().mockResolvedValue(allResult),
      };

      const mockDb = {
        prepare: vi.fn().mockReturnValue(stocksStmt),
      };
      mockEnv.stockly = mockDb as unknown as D1Database;

      const request = createMockRequest("/v1/api/favorite-stocks");
      const response = await getFavoriteStocks(request, mockEnv, mockLogger);

      expect(response.status).toBe(200);
      const data = await response.json();
      // Response should be { stocks: [...] }
      expect(data).toHaveProperty("stocks");
      expect(Array.isArray(data.stocks)).toBe(true);
      expect(data.stocks.length).toBe(2);
      expect(data.stocks[0].symbol).toBe("AAPL");
    });

    it("should return 401 for unauthenticated request", async () => {
      vi.mocked(authenticateRequest).mockResolvedValue(null);

      const request = createMockRequest("/v1/api/favorite-stocks");
      const response = await getFavoriteStocks(request, mockEnv, mockLogger);

      expect(response.status).toBe(401);
    });
  });

  describe("updateFavoriteStocks", () => {
    it("should update favorite stocks for authenticated user", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;

      // Mock user lookup
      const userStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: "user-123" }),
      };

      // Mock delete and insert - need to handle multiple inserts
      const deleteStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      const insertStmt1 = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      const insertStmt2 = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      mockDb.prepare
        .mockReturnValueOnce(userStmt)
        .mockReturnValueOnce(deleteStmt)
        .mockReturnValueOnce(insertStmt1)
        .mockReturnValueOnce(insertStmt2);

      const request = createMockRequest("/v1/api/favorite-stocks", {
        method: "PUT",
        body: { symbols: ["AAPL", "GOOGL"] },
      });

      const response = await updateFavoriteStocks(request, mockEnv, mockLogger);
      expect(response.status).toBe(200);
    });

    it("should validate symbols array", async () => {
      const request = createMockRequest("/v1/api/favorite-stocks", {
        method: "PUT",
        body: { symbols: "not-an-array" },
      });

      const response = await updateFavoriteStocks(request, mockEnv, mockLogger);
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("deleteFavoriteStock", () => {
    it("should delete favorite stock for authenticated user", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;

      // Mock delete - returns meta with changes > 0 to indicate success
      const deleteStmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ 
          success: true,
          meta: { changes: 1 }
        }),
      };

      mockDb.prepare.mockReturnValueOnce(deleteStmt);

      const request = createMockRequest("/v1/api/favorite-stocks/AAPL", {
        method: "DELETE",
      });

      const response = await deleteFavoriteStock(
        request,
        "AAPL",
        mockEnv,
        mockLogger
      );
      expect(response.status).toBe(200);
    });
  });
});


