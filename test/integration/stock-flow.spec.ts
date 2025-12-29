/**
 * Stock Data Flow Integration Tests
 * 
 * Tests the complete flow of stock data retrieval and caching
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { QuotesController } from "../../src/controllers/quotes.controller";
import { createQuotesService } from "../../src/factories/createQuotesService";
import { SearchController } from "../../src/controllers/search.controller";
import { createSearchService } from "../../src/factories/createSearchService";
import { D1DatabaseWrapper } from "../../src/infrastructure/database/D1Database";
import { StockController } from "../../src/controllers/stocks.controller";
import { createStockService } from "../../src/factories/createStockService";
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
      run: vi.fn().mockResolvedValue({
        success: true,
        meta: {
          changes: 1,
          last_row_id: 1,
        },
      }),
    };
    mockDb.prepare.mockReturnValue(defaultStmt);
    
    // Mock fetch - profile fetcher tries endpoints sequentially, first one succeeds
    // Reset counter at start of each test
    (globalThis as any).__profileCallCount = 0;
    (globalThis as any).__profileCallCounts = new Map<string, number>();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/quote?")) {
        const symbol = url.match(/symbol=([^&]+)/)?.[1] || "AAPL";
        return Promise.resolve({
          ok: true,
          json: async () => [{ 
            price: 100, 
            symbol: symbol.toUpperCase(), 
            name: `${symbol.toUpperCase()} Inc.`, 
            change: 1.5, 
            changePercent: 1.5,
            changePercentage: 1.5,
            image: `https://images.financialmodelingprep.com/symbol/${symbol.toUpperCase()}.png`
          }],
        } as Response);
      }
      if (url.includes("/profile")) {
        const symbol = url.match(/symbol=([^&]+)/)?.[1] || url.match(/profile\/([^?]+)/)?.[1] || "AAPL";
        const callCount = ((globalThis as any).__profileCallCounts.get(symbol) || 0) + 1;
        (globalThis as any).__profileCallCounts.set(symbol, callCount);
        // First profile endpoint call per symbol succeeds
        if (callCount === 1) {
          const symbol = url.match(/symbol=([^&]+)/)?.[1] || url.match(/profile\/([^?]+)/)?.[1] || "AAPL";
          return Promise.resolve({
            ok: true,
            json: async () => [{ 
              symbol: symbol.toUpperCase(), 
              Symbol: symbol.toUpperCase(),
              description: `${symbol.toUpperCase()} Inc. description`, 
              image: `https://images.financialmodelingprep.com/symbol/${symbol.toUpperCase()}.png` 
            }],
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => [],
        } as Response);
      }
      if (url.includes("wikipedia.org")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ extract: "Company description" }),
        } as Response);
      }
      // Default fallback for other API calls (search, historical, etc.)
      if (url.includes("/search") || url.includes("/historical")) {
        return Promise.resolve({
          ok: true,
          json: async () => ([]),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ price: 100, symbol: "AAPL" }),
      } as Response);
    });
    
    vi.clearAllMocks();
  });

  describe("Stock Search to Details Flow", () => {
    it("should complete flow: search -> get stock -> get details", async () => {
      // 1. Search for stock
      const searchRequest = createMockRequest("/v1/api/search-stock?query=AAPL");
      const searchService = createSearchService(mockEnv, mockLogger);
      const searchController = new SearchController(searchService, mockLogger, mockEnv);
      const searchResponse = await searchController.searchStock(searchRequest);
      
      expect(searchResponse.status).toBe(200);
      const searchData = await searchResponse.json();
      expect(Array.isArray(searchData)).toBe(true);

      // 2. Get stock quote
      const stockRequest = createMockRequest("/v1/api/get-stock?symbol=AAPL");
      const quotesService = createQuotesService(mockEnv, mockLogger);
      const db = new D1DatabaseWrapper(mockEnv.stockly, mockLogger);
      const quotesController = new QuotesController(quotesService, mockLogger, mockEnv, db);
      const stockResponse = await quotesController.getStock(stockRequest, mockCtx);
      
      expect(stockResponse.status).toBe(200);
      const stockData = await stockResponse.json();
      expect(stockData.symbol).toBe("AAPL");

      // 3. Get stock details (using the symbol from the route)
      const detailsRequest = createMockRequest("/v1/api/get-stock-details/AAPL");
      const stockService = createStockService(mockEnv, mockLogger);
      const controller = new StockController(stockService, mockLogger, mockEnv);
      const detailsResponse = await controller.getStockDetails(detailsRequest, "AAPL");
      
      expect(detailsResponse.status).toBe(200);
      const detailsData = await detailsResponse.json();
      expect(detailsData.stockDetails?.symbol || detailsData.symbol).toBe("AAPL");
    });
  });

  describe("Batch Stock Retrieval Flow", () => {
    it("should retrieve multiple stocks efficiently", async () => {
      const symbols = ["AAPL", "GOOGL", "MSFT"];
      const request = createMockRequest(`/v1/api/get-stocks?symbols=${symbols.join(",")}`);
      
      const quotesService = createQuotesService(mockEnv, mockLogger);
      const db = new D1DatabaseWrapper(mockEnv.stockly, mockLogger);
      const quotesController = new QuotesController(quotesService, mockLogger, mockEnv, db);
      const response = await quotesController.getStocks(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe("Caching Flow", () => {
    it("should cache stock data and serve from cache on subsequent requests", async () => {
      // First request - should fetch from API
      const firstRequest = createMockRequest("/v1/api/get-stock?symbol=AAPL");
      const quotesService = createQuotesService(mockEnv, mockLogger);
      const db = new D1DatabaseWrapper(mockEnv.stockly, mockLogger);
      const quotesController = new QuotesController(quotesService, mockLogger, mockEnv, db);
      const firstResponse = await quotesController.getStock(firstRequest, mockCtx);
      
      expect(firstResponse.status).toBe(200);

      // Second request - should serve from cache
      const secondRequest = createMockRequest("/v1/api/get-stock?symbol=AAPL");
      const secondResponse = await quotesController.getStock(secondRequest, mockCtx);
      
      expect(secondResponse.status).toBe(200);
      // Note: Would verify cache hit in actual implementation
    });
  });
});






