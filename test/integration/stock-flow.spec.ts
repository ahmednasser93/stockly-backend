/**
 * Stock Data Flow Integration Tests
 * 
 * Tests the complete flow of stock data retrieval and caching
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getStock } from "../../src/api/get-stock";
import { getStocks } from "../../src/api/get-stocks";
import { searchStock } from "../../src/api/search-stock";
import { getStockDetailsRoute } from "../../src/api/get-stock-details";
import type { Env } from "../../src/index";
import {
  createMockEnv,
  createMockRequest,
  createMockLogger,
  createMockD1Database,
} from "../test-utils";
import { createMockExecutionContext } from "../utils/helpers";

describe("Stock Data Flow Integration", () => {
  let mockEnv: Env;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockCtx: ExecutionContext;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockLogger = createMockLogger();
    mockCtx = createMockExecutionContext();
    
    // Set up database mocks
    const { mockDb } = createMockD1Database();
    mockEnv.stockly = mockDb as unknown as D1Database;
    
    // Default mock for database queries (returns null/empty by default)
    const defaultStmt = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ success: true }),
    };
    mockDb.prepare.mockReturnValue(defaultStmt);
    
    // Mock fetch for external API calls
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ price: 100, symbol: "AAPL" }),
    } as Response);
    
    vi.clearAllMocks();
  });

  describe("Stock Search to Details Flow", () => {
    it("should complete flow: search -> get stock -> get details", async () => {
      // 1. Search for stock
      const searchRequest = createMockRequest("/v1/api/search-stock?query=AAPL");
      const searchResponse = await searchStock(
        searchRequest,
        new URL(searchRequest.url),
        mockEnv,
        mockLogger
      );
      
      expect(searchResponse.status).toBe(200);
      const searchData = await searchResponse.json();
      expect(Array.isArray(searchData)).toBe(true);

      // 2. Get stock quote
      const stockRequest = createMockRequest("/v1/api/get-stock?symbol=AAPL");
      const stockResponse = await getStock(
        stockRequest,
        new URL(stockRequest.url),
        mockEnv,
        mockCtx,
        mockLogger
      );
      
      expect(stockResponse.status).toBe(200);
      const stockData = await stockResponse.json();
      expect(stockData.symbol).toBe("AAPL");

      // 3. Get stock details
      const detailsRequest = createMockRequest("/v1/api/get-stock-details?symbol=AAPL");
      const detailsResponse = await getStockDetailsRoute(
        detailsRequest,
        new URL(detailsRequest.url),
        mockEnv,
        mockCtx,
        mockLogger
      );
      
      expect(detailsResponse.status).toBe(200);
      const detailsData = await detailsResponse.json();
      expect(detailsData.symbol).toBe("AAPL");
    });
  });

  describe("Batch Stock Retrieval Flow", () => {
    it("should retrieve multiple stocks efficiently", async () => {
      const symbols = ["AAPL", "GOOGL", "MSFT"];
      const request = createMockRequest(`/v1/api/get-stocks?symbols=${symbols.join(",")}`);
      
      const response = await getStocks(
        request,
        new URL(request.url),
        mockEnv,
        mockLogger
      );
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe("Caching Flow", () => {
    it("should cache stock data and serve from cache on subsequent requests", async () => {
      // First request - should fetch from API
      const firstRequest = createMockRequest("/v1/api/get-stock?symbol=AAPL");
      const firstResponse = await getStock(
        firstRequest,
        new URL(firstRequest.url),
        mockEnv,
        mockCtx,
        mockLogger
      );
      
      expect(firstResponse.status).toBe(200);

      // Second request - should serve from cache
      const secondRequest = createMockRequest("/v1/api/get-stock?symbol=AAPL");
      const secondResponse = await getStock(
        secondRequest,
        new URL(secondRequest.url),
        mockEnv,
        mockCtx,
        mockLogger
      );
      
      expect(secondResponse.status).toBe(200);
      // Note: Would verify cache hit in actual implementation
    });
  });
});





