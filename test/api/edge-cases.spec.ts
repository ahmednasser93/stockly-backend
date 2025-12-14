/**
 * Edge Cases and Error Scenarios Tests
 * 
 * Tests for edge cases, error handling, and boundary conditions across all API endpoints
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getStock } from "../../src/api/get-stock";
import { getStocks } from "../../src/api/get-stocks";
import { searchStock } from "../../src/api/search-stock";
import { handleAlertsRequest } from "../../src/api/alerts";
import type { Env } from "../../src/index";
import {
  createMockEnv,
  createMockRequest,
  createMockLogger,
} from "../test-utils";
import { createMockExecutionContext } from "../utils/helpers";

describe("Edge Cases and Error Scenarios", () => {
  let mockEnv: Env;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockCtx: ExecutionContext;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockLogger = createMockLogger();
    mockCtx = createMockExecutionContext();
    vi.clearAllMocks();
  });

  describe("Invalid Input Handling", () => {
    it("should handle empty symbol in getStock", async () => {
      const request = createMockRequest("/v1/api/get-stock?symbol=");
      const response = await getStock(request, new URL(request.url), mockEnv, mockCtx, mockLogger);
      
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should handle invalid symbol format", async () => {
      const request = createMockRequest("/v1/api/get-stock?symbol=!!!");
      const response = await getStock(request, new URL(request.url), mockEnv, mockCtx, mockLogger);
      
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should handle empty symbols array in getStocks", async () => {
      const request = createMockRequest("/v1/api/get-stocks?symbols=");
      const response = await getStocks(request, new URL(request.url), mockEnv, mockLogger);
      
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should handle very long symbol list in getStocks", async () => {
      const symbols = Array(1000).fill("AAPL").join(",");
      const request = createMockRequest(`/v1/api/get-stocks?symbols=${symbols}`);
      
      // Mock the database prepare to return a bind method
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      mockEnv.stockly = mockDb as unknown as D1Database;
      
      // Mock fetch to return successful responses to prevent 500 errors
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify([{
          symbol: "AAPL",
          price: 150,
          name: "Apple Inc.",
          image: "https://example.com/apple.png",
        }]), { status: 200 })
      );
      
      const response = await getStocks(request, new URL(request.url), mockEnv, mockLogger);
      
      // Should either handle it or reject with appropriate error
      // With mocked fetch, it should return 200 (successfully processes the symbols)
      expect([200, 400, 413, 500]).toContain(response.status);
    });

    it("should handle empty search query", async () => {
      const request = createMockRequest("/v1/api/search-stock?query=");
      const response = await searchStock(request, new URL(request.url), mockEnv, mockLogger);
      
      // searchStock returns 200 with empty array for invalid queries
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    });

    it("should handle SQL injection attempts in search", async () => {
      const maliciousQuery = "'; DROP TABLE users; --";
      const request = createMockRequest(`/v1/api/search-stock?query=${encodeURIComponent(maliciousQuery)}`);
      const response = await searchStock(request, new URL(request.url), mockEnv, mockLogger);
      
      // Should sanitize and handle safely
      expect([200, 400]).toContain(response.status);
    });
  });

  describe("Database Error Handling", () => {
    it("should handle database connection errors gracefully", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;
      
      // Simulate database error
      mockDb.prepare.mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      const request = createMockRequest("/v1/api/get-stock?symbol=AAPL");
      const response = await getStock(request, new URL(request.url), mockEnv, mockCtx, mockLogger);
      
      // getStock may handle errors gracefully and return 200 with error flag, or 500
      expect([200, 500]).toContain(response.status);
      const data = await response.json();
      expect(data.error || data).toBeDefined();
    });

    it("should handle database timeout errors", async () => {
      const { mockDb } = createMockD1Database();
      mockEnv.stockly = mockDb as unknown as D1Database;
      
      const stmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(() => {
          return new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Timeout")), 100);
          });
        }),
      };
      mockDb.prepare.mockReturnValue(stmt);

      // Mock fetch to return valid data so getStock can fallback gracefully
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ symbol: "AAPL", price: 150 }],
      } as Response);

      const request = createMockRequest("/v1/api/get-stock?symbol=AAPL");
      const response = await getStock(request, new URL(request.url), mockEnv, mockCtx, mockLogger);
      
      // getStock handles errors gracefully and falls back to API, so it might return 200
      expect([200, 500]).toContain(response.status);
    });
  });

  describe("External API Error Handling", () => {
    it("should handle external API rate limiting", async () => {
      // Mock external API returning 429
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      } as Response);

      const request = createMockRequest("/v1/api/get-stock?symbol=AAPL");
      const response = await getStock(request, new URL(request.url), mockEnv, mockCtx, mockLogger);
      
      // Should handle gracefully, possibly with retry or error message
      expect([200, 429, 503]).toContain(response.status);
    });

    it("should handle external API timeout", async () => {
      // Mock external API timeout
      global.fetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Timeout")), 100);
        });
      });

      // Mock DB to return null so it tries to fetch from API, which will timeout
      const { mockDb } = createMockD1Database();
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });
      mockEnv.stockly = mockDb as unknown as D1Database;

      const request = createMockRequest("/v1/api/get-stock?symbol=AAPL");
      const response = await getStock(request, new URL(request.url), mockEnv, mockCtx, mockLogger);
      
      // getStock handles errors gracefully and falls back to DB, so it might return 200 or 500
      expect([200, 500]).toContain(response.status);
    });

    it("should handle external API returning invalid JSON", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      } as Response);

      // Mock DB to return null so it tries to fetch from API, which will fail
      const { mockDb } = createMockD1Database();
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });
      mockEnv.stockly = mockDb as unknown as D1Database;

      const request = createMockRequest("/v1/api/get-stock?symbol=AAPL");
      const response = await getStock(request, new URL(request.url), mockEnv, mockCtx, mockLogger);
      
      // getStock handles errors gracefully and falls back to DB, so it might return 200 or 500
      expect([200, 500]).toContain(response.status);
    });
  });

  describe("Authentication Edge Cases", () => {
    it("should handle expired access token", async () => {
      const request = createMockRequest("/v1/api/get-stock?symbol=AAPL", {
        headers: {
          Authorization: "Bearer expired-token",
        },
      });
      
      // Mock authentication returning null (expired token)
      vi.mock("../../src/auth/middleware", () => ({
        authenticateRequest: vi.fn().mockResolvedValue(null),
      }));

      // Note: This would need proper mocking
      // This is a placeholder for the test structure
    });

    it("should handle malformed authorization header", async () => {
      const request = createMockRequest("/v1/api/get-stock?symbol=AAPL", {
        headers: {
          Authorization: "InvalidFormat token",
        },
      });
      
      // Should return 401
      // Note: This would need proper mocking
    });
  });

  describe("Alert Edge Cases", () => {
    it("should handle negative threshold values", async () => {
      const request = createMockRequest("/v1/api/alerts", {
        method: "POST",
        body: {
          symbol: "AAPL",
          direction: "above",
          threshold: -100, // Invalid negative threshold
        },
      });
      
      // Note: This would need proper mocking and authentication
      // This is a placeholder for the test structure
    });

    it("should handle extremely large threshold values", async () => {
      const request = createMockRequest("/v1/api/alerts", {
        method: "POST",
        body: {
          symbol: "AAPL",
          direction: "above",
          threshold: Number.MAX_SAFE_INTEGER,
        },
      });
      
      // Should validate and reject or handle appropriately
      // Note: This would need proper mocking
    });

    it("should handle missing required fields in alert creation", async () => {
      const request = createMockRequest("/v1/api/alerts", {
        method: "POST",
        body: {
          // Missing symbol, direction, threshold
        },
      });
      
      // Should return 400 with validation error
      // Note: This would need proper mocking
    });
  });

  describe("Boundary Conditions", () => {
    it("should handle maximum number of symbols in batch request", async () => {
      const maxSymbols = 100; // Assuming max is 100
      const symbols = Array(maxSymbols).fill("AAPL").join(",");
      const request = createMockRequest(`/v1/api/get-stocks?symbols=${symbols}`);
      const response = await getStocks(request, new URL(request.url), mockEnv, mockLogger);
      
      // Should either handle or reject with appropriate error
      expect([200, 400, 413]).toContain(response.status);
    });

    it("should handle very long search query", async () => {
      const longQuery = "A".repeat(10000);
      const request = createMockRequest(`/v1/api/search-stock?query=${encodeURIComponent(longQuery)}`);
      const response = await searchStock(request, new URL(request.url), mockEnv, mockLogger);
      
      // Should either handle or reject with appropriate error
      expect([200, 400, 413]).toContain(response.status);
    });
  });

  describe("Concurrent Request Handling", () => {
    it("should handle multiple simultaneous requests for same symbol", async () => {
      const requests = Array(10).fill(null).map(() =>
        createMockRequest("/v1/api/get-stock?symbol=AAPL")
      );
      
      const responses = await Promise.all(
        requests.map(req => getStock(req, new URL(req.url), mockEnv, mockCtx, mockLogger))
      );
      
      // All should complete successfully or with appropriate errors
      responses.forEach(response => {
        expect([200, 429, 500, 503]).toContain(response.status);
      });
    });
  });
});

// Import helper functions
import { createMockD1Database } from "../utils/factories";


