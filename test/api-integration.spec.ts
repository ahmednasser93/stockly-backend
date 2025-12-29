/**
 * API INTEGRATION TESTS
 * 
 * These tests verify the full integration flow of API endpoints,
 * including request/response cycles, error handling, and data consistency.
 * 
 * These tests use the same schema validation as api-schema-validation.spec.ts
 * to ensure responses match the expected schemas.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { QuotesController } from "../src/controllers/quotes.controller";
import { createQuotesService } from "../src/factories/createQuotesService";
import { SearchController } from "../src/controllers/search.controller";
import { createSearchService } from "../src/factories/createSearchService";
import { HistoricalController } from "../src/controllers/historical.controller";
import { createHistoricalService } from "../src/factories/createHistoricalService";
import { D1DatabaseWrapper } from "../src/infrastructure/database/D1Database";
import { AlertController } from "../src/controllers/alerts.controller";
import { createAlertService } from "../src/factories/createAlertService";
import { healthCheck } from "../src/api/health";
import { createMockLogger } from "./test-utils";
vi.mock("../src/factories/createAlertService", () => ({
  createAlertService: vi.fn(),
}));

vi.mock("../src/factories/createQuotesService", () => ({
  createQuotesService: vi.fn(),
}));

vi.mock("../src/factories/createSearchService", () => ({
  createSearchService: vi.fn(),
}));

vi.mock("../src/factories/createHistoricalService", () => ({
  createHistoricalService: vi.fn(),
}));

vi.mock("../src/auth/middleware", () => ({
  authenticateRequest: vi.fn(),
  authenticateRequestWithAdmin: vi.fn(),
}));

import { authenticateRequestWithAdmin } from "../src/auth/middleware";

import { API_KEY, API_URL } from "../src/util";
import { clearCache, setCache } from "../src/api/cache";
import { clearConfigCache } from "../src/api/config";
import {
  validateStockQuoteResponse,
  validateStockQuotesResponse,
  validateAlert,
  validateAlertsListResponse,
  validateHistoricalPricesResponse,
  validateHealthCheckResponse,
  validateErrorResponse,
} from "./schemas";
import type { Env } from "../src/index";

// ============================================================================
// TEST HELPERS
// ============================================================================

const createUrl = (path: string, params: Record<string, string> = {}) => {
  const url = new URL(path, "https://example.com");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
};

const createRequest = (path: string, params: Record<string, string> = {}) => {
  const url = createUrl(path, params);
  return new Request(url.toString());
};

const createEnv = (): Env => {
  const run = vi.fn().mockResolvedValue({
    success: true,
    meta: {
      changes: 1,
      last_row_id: 1,
    },
  });
  const bind = vi.fn().mockReturnValue({ 
    run, 
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
  });
  const prepare = vi.fn().mockReturnValue({ bind });
  return {
    stockly: { prepare } as any,
    alertsKv: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as any,
  };
};

// ============================================================================
// HEALTH CHECK INTEGRATION TESTS
// ============================================================================

describe("API Integration - Health Check", () => {
  it("health endpoint returns OK status", async () => {
    const response = await healthCheck();
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(validateHealthCheckResponse(data)).toBe(true);
    expect(data.status).toBe("ok");
  });
});

// ============================================================================
// GET STOCK INTEGRATION TESTS
// ============================================================================

describe("API Integration - Get Stock", () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
    // Reset profileCallMap for each test
    if (typeof (globalThis as any).profileCallMap !== 'undefined') {
      (globalThis as any).profileCallMap = new Map();
    }
  });

  it("successfully fetches and returns stock data with all required fields", async () => {
    const mockQuote = {
      symbol: "AAPL",
      name: "Apple Inc.",
      price: 175.50,
      change: 1.25,
      changePercentage: 0.72,
      volume: 50000000,
      dayLow: 174.00,
      dayHigh: 176.00,
      yearLow: 150.00,
      yearHigh: 200.00,
      marketCap: 2800000000000,
      exchange: "NASDAQ",
      currency: "USD",
      image: "https://images.financialmodelingprep.com/symbol/AAPL.png",
      description: "Apple Inc. designs and manufactures...",
    };

    // Mock fetch for quote API, profile API, and Wikipedia API
    const profileCallMap = new Map<string, number>();
    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      if (url.includes("/quote?")) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ 
            ...mockQuote, 
            image: mockQuote.image || `https://images.financialmodelingprep.com/symbol/${mockQuote.symbol}.png`
          }],
        } as Response);
      }
      if (url.includes("/profile")) {
        const callKey = url;
        const callCount = (profileCallMap.get(callKey) || 0) + 1;
        profileCallMap.set(callKey, callCount);
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => [{ 
              ...mockQuote, 
              description: mockQuote.description, 
              symbol: mockQuote.symbol, 
              Symbol: mockQuote.symbol,
              image: mockQuote.image || `https://images.financialmodelingprep.com/symbol/${mockQuote.symbol}.png`
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
          json: async () => ({ extract: mockQuote.description || "Company description" }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 404,
      } as Response);
    });

    const env = createEnv();
    const request = createRequest("/v1/api/get-stock", { symbol: "AAPL" });
    const logger = createMockLogger();
    // Use real implementation (unmock for this test)
    vi.doUnmock("../src/factories/createQuotesService");
    const { createQuotesService: realCreateQuotesService } = await import("../src/factories/createQuotesService");
    const quotesService = realCreateQuotesService(env, logger);
    const db = new D1DatabaseWrapper(env.stockly, logger);
    const controller = new QuotesController(quotesService, logger, env, db);
    const response = await controller.getStock(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateStockQuoteResponse(data)).toBe(true);
    expect(data.symbol).toBe("AAPL");
    expect(data.price).toBe(175.50);
    expect(data.name).toBe("Apple Inc.");
    expect(data.image).toBeTruthy();
  });

  it("returns error when symbol is missing", async () => {
    const env = createEnv();
    const request = createRequest("/v1/api/get-stock");
    const logger = createMockLogger();
    // Use real implementation (unmock for this test)
    vi.doUnmock("../src/factories/createQuotesService");
    const { createQuotesService: realCreateQuotesService } = await import("../src/factories/createQuotesService");
    const quotesService = realCreateQuotesService(env, logger);
    const db = new D1DatabaseWrapper(env.stockly, logger);
    const controller = new QuotesController(quotesService, logger, env, db);
    const response = await controller.getStock(request);
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
    expect(data.error).toBeDefined();
    // Error message should indicate missing required field (symbol)
    if (typeof data.error === 'string') {
      expect(data.error.toLowerCase()).toMatch(/symbol|required/);
    } else if (data.error?.message) {
      expect(data.error.message.toLowerCase()).toMatch(/symbol|required/);
    }
  });

  it("uses cache when available", async () => {
    const cachedData = {
      symbol: "MSFT",
      name: "Microsoft Corp.",
      price: 350.00,
      change: -2.00,
      changePercentage: -0.57,
      volume: 20000000,
      dayLow: 348.00,
      dayHigh: 352.00,
      image: "https://images.financialmodelingprep.com/symbol/MSFT.png",
      description: null,
    };

    setCache("quote:MSFT", cachedData, 30);
    const fetchSpy = vi.spyOn(globalThis as any, "fetch");

    const env = createEnv();
    const request = createRequest("/v1/api/get-stock", { symbol: "MSFT" });
    const logger = createMockLogger();
    const quotesService = createQuotesService(env, logger);
    const db = new D1DatabaseWrapper(env.stockly, logger);
    const controller = new QuotesController(quotesService, logger, env, db);
    const response = await controller.getStock(request);
    
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateStockQuoteResponse(data)).toBe(true);
    expect(data.symbol).toBe("MSFT");
  });
});

// ============================================================================
// GET STOCKS INTEGRATION TESTS
// ============================================================================

describe("API Integration - Get Stocks", () => {
  beforeEach(() => {
    clearCache();
    clearConfigCache();
    vi.restoreAllMocks();
    // Reset profile call counter for each test
    (globalThis as any).__profileCallCounts = new Map<string, number>();
  });

  it("successfully fetches multiple stocks with all required fields", async () => {
    // Clear caches to ensure fresh fetch
    clearCache();
    clearConfigCache();
    
    const mockQuotes = [
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        price: 175.50,
        change: 1.25,
        changePercentage: 0.72,
        volume: 50000000,
        dayLow: 174.00,
        dayHigh: 176.00,
        image: "https://images.financialmodelingprep.com/symbol/AAPL.png",
        description: "Apple Inc. designs...",
      },
      {
        symbol: "MSFT",
        name: "Microsoft Corp.",
        price: 350.00,
        change: -2.00,
        changePercentage: -0.57,
        volume: 20000000,
        dayLow: 348.00,
        dayHigh: 352.00,
        image: "https://images.financialmodelingprep.com/symbol/MSFT.png",
        description: "Microsoft Corporation...",
      },
    ];

    // Mock fetch - profile fetcher tries endpoints sequentially, first one succeeds per symbol
    // Reset counter at start of each test
    (globalThis as any).__profileCallCounts = new Map<string, number>();
    vi.spyOn(globalThis as any, "fetch")
      .mockImplementation((url: string) => {
        if (url.includes("/quote?")) {
          const symbol = url.match(/symbol=([^&]+)/)?.[1];
          const quote = mockQuotes.find(q => q.symbol === symbol?.toUpperCase());
          return Promise.resolve({
            ok: true,
            json: async () => quote ? [{ 
              ...quote, 
              image: quote.image || `https://images.financialmodelingprep.com/symbol/${quote.symbol}.png`,
              changePercentage: quote.changePercent,
            }] : [],
          } as Response);
        }
        // Profile endpoint - first call per symbol succeeds
        if (url.includes("/profile")) {
          const symbol = url.match(/symbol=([^&]+)/)?.[1] || url.match(/profile\/([^?]+)/)?.[1] || "";
          const callCount = ((globalThis as any).__profileCallCounts.get(symbol) || 0) + 1;
          (globalThis as any).__profileCallCounts.set(symbol, callCount);
          const quote = mockQuotes.find(q => q.symbol === symbol?.toUpperCase());
          if (quote && callCount === 1) {
            return Promise.resolve({
              ok: true,
              json: async () => [{ 
                ...quote, 
                description: `${quote.name} description`, 
                symbol: quote.symbol, 
                Symbol: quote.symbol,
                image: quote.image || `https://images.financialmodelingprep.com/symbol/${quote.symbol}.png`
              }],
            } as Response);
          }
          return Promise.resolve({
            ok: true,
            json: async () => [],
          } as Response);
        }
        // Wikipedia - return description
        if (url.includes("wikipedia.org")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ extract: "Company description" }),
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          status: 404,
        } as Response);
      });

    const env = createEnv();
    const request = createRequest("/v1/api/get-stocks", { symbols: "AAPL,MSFT" });
    const logger = createMockLogger();
    // Use real implementation (unmock for this test)
    vi.doUnmock("../src/factories/createQuotesService");
    const { createQuotesService: realCreateQuotesService } = await import("../src/factories/createQuotesService");
    const quotesService = realCreateQuotesService(env, logger);
    const db = new D1DatabaseWrapper(env.stockly, logger);
    const controller = new QuotesController(quotesService, logger, env, db);
    const response = await controller.getStocks(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateStockQuotesResponse(data)).toBe(true);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    data.forEach((quote, index) => {
      expect(validateStockQuoteResponse(quote)).toBe(true);
      expect(quote.symbol).toBe(mockQuotes[index].symbol);
      expect(quote.price).toBe(mockQuotes[index].price);
      expect(quote.name).toBeTruthy();
      expect(quote.image).toBeTruthy();
    });
  });

  it("returns error when symbols parameter is missing", async () => {
    const env = createEnv();
    const request = createRequest("/v1/api/get-stocks");
    const logger = createMockLogger();
    // Use real implementation (unmock for this test)
    vi.doUnmock("../src/factories/createQuotesService");
    const { createQuotesService: realCreateQuotesService } = await import("../src/factories/createQuotesService");
    const quotesService = realCreateQuotesService(env, logger);
    const db = new D1DatabaseWrapper(env.stockly, logger);
    const controller = new QuotesController(quotesService, logger, env, db);
    const response = await controller.getStocks(request);
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
  });

  it("handles empty symbols list", async () => {
    const env = createEnv();
    const request = createRequest("/v1/api/get-stocks", { symbols: "" });
    const logger = createMockLogger();
    // Use real implementation (unmock for this test)
    vi.doUnmock("../src/factories/createQuotesService");
    const { createQuotesService: realCreateQuotesService } = await import("../src/factories/createQuotesService");
    const quotesService = realCreateQuotesService(env, logger);
    const db = new D1DatabaseWrapper(env.stockly, logger);
    const controller = new QuotesController(quotesService, logger, env, db);
    const response = await controller.getStocks(request);
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
  });
});

// ============================================================================
// SEARCH STOCK INTEGRATION TESTS
// ============================================================================

describe("API Integration - Search Stock", () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  it("successfully searches and returns matching stocks", async () => {
    const mockResults = [
      { symbol: "AAPL", name: "Apple Inc.", currency: "USD", exchangeFullName: "NASDAQ" },
      { symbol: "AMZN", name: "Amazon.com Inc.", currency: "USD", exchangeFullName: "NASDAQ" },
    ];

    vi.spyOn(globalThis as any, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    } as Response);

    const env = createEnv();
    const request = createRequest("/v1/api/search-stock", { query: "AP" });
    // Use real implementation (unmock for this test)
    vi.doUnmock("../src/factories/createSearchService");
    const { createSearchService: realCreateSearchService } = await import("../src/factories/createSearchService");
    const searchService = realCreateSearchService(env, createMockLogger());
    const controller = new SearchController(searchService, createMockLogger(), env);
    const response = await controller.searchStock(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    data.forEach((item) => {
      expect(item).toHaveProperty("symbol");
      expect(item).toHaveProperty("name");
      expect(typeof item.symbol).toBe("string");
      expect(typeof item.name).toBe("string");
    });
  });

  it("returns empty array when query parameter is missing", async () => {
    const env = createEnv();
    const request = createRequest("/v1/api/search-stock");
    // Use real implementation (unmock for this test)
    vi.doUnmock("../src/factories/createSearchService");
    const { createSearchService: realCreateSearchService } = await import("../src/factories/createSearchService");
    const searchService = realCreateSearchService(env, createMockLogger());
    const controller = new SearchController(searchService, createMockLogger(), env);
    const response = await controller.searchStock(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });
});

// ============================================================================
// GET HISTORICAL INTEGRATION TESTS
// ============================================================================

describe("API Integration - Get Historical", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("successfully fetches historical price data", async () => {
    const mockHistoricalData = {
      results: [
        { date: "2025-01-01", price: 175.50, volume: 50000000 },
        { date: "2025-01-02", price: 176.00, volume: 51000000 },
        { date: "2025-01-03", price: 175.75, volume: 49000000 },
      ],
    };

    const env = createEnv();
    const run = vi.fn().mockResolvedValue({
      success: true,
      meta: {
        changes: 1,
        last_row_id: 1,
      },
    });
    const bind = vi.fn().mockReturnValue({
      run,
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue(mockHistoricalData),
    });
    env.stockly.prepare = vi.fn().mockReturnValue({ bind });

    const request = createRequest("/v1/api/get-historical", { symbol: "AAPL", days: "180" });
    // Use real implementation (unmock for this test)
    vi.doUnmock("../src/factories/createHistoricalService");
    const { createHistoricalService: realCreateHistoricalService } = await import("../src/factories/createHistoricalService");
    const historicalService = realCreateHistoricalService(env, createMockLogger());
    const controller = new HistoricalController(historicalService, createMockLogger(), env);
    const response = await controller.getHistorical(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateHistoricalPricesResponse(data)).toBe(true);
    expect(data.symbol).toBe("AAPL");
    expect(data.days).toBe(180);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);
  });

  it("returns error when symbol is missing", async () => {
    const env = createEnv();
    const request = createRequest("/v1/api/get-historical");
    // Use real implementation (unmock for this test)
    vi.doUnmock("../src/factories/createHistoricalService");
    const { createHistoricalService: realCreateHistoricalService } = await import("../src/factories/createHistoricalService");
    const historicalService = realCreateHistoricalService(env, createMockLogger());
    const controller = new HistoricalController(historicalService, createMockLogger(), env);
    const response = await controller.getHistorical(request);
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
  });

  it("validates days parameter", async () => {
    const env = createEnv();
    const request = createRequest("/v1/api/get-historical", { symbol: "AAPL", days: "0" });
    // Use real implementation (unmock for this test)
    vi.doUnmock("../src/factories/createHistoricalService");
    const { createHistoricalService: realCreateHistoricalService } = await import("../src/factories/createHistoricalService");
    const historicalService = realCreateHistoricalService(env, createMockLogger());
    const controller = new HistoricalController(historicalService, createMockLogger(), env);
    const response = await controller.getHistorical(request);
    
    // Should handle invalid days (0 or negative)
    expect([400, 500]).toContain(response.status);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
  });
});

// ============================================================================
// ALERTS INTEGRATION TESTS
// ============================================================================

describe("API Integration - Alerts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset auth mock to return authenticated user
    vi.mocked(authenticateRequestWithAdmin).mockResolvedValue({
      username: "testuser",
      userId: "user-123",
      tokenType: "access" as const,
      isAdmin: false,
    });
  });

  it("successfully lists all alerts", async () => {
    const mockAlerts = [
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        symbol: "AAPL",
        direction: "above" as const,
        threshold: 200,
        status: "active" as const,
        channel: "notification" as const,
        username: "testuser",
        notes: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
    ];

    const mockService = {
      listAlerts: vi.fn().mockResolvedValue(mockAlerts),
    };
    vi.mocked(createAlertService).mockReturnValue(mockService as any);

    const request = new Request("https://example.com/v1/api/alerts", { method: "GET" });
    const env = createEnv();
    const logger = createMockLogger();
    const alertService = createAlertService(env, logger);
    const controller = new AlertController(alertService, logger, env);
    const response = await controller.listAlerts(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateAlertsListResponse(data)).toBe(true);
    expect(data.alerts).toHaveLength(1);
    expect(validateAlert(data.alerts[0])).toBe(true);
  });

  it("successfully creates an alert", async () => {
    const createRequest = {
      symbol: "AAPL",
      direction: "above" as const,
      threshold: 200,
      channel: "notification" as const,
    };

    const createdAlert = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      symbol: "AAPL",
      direction: "above" as const,
      threshold: 200,
      status: "active" as const,
      channel: "notification" as const,
      username: "testuser",
      notes: null,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };

    const mockService = {
      createAlert: vi.fn().mockResolvedValue(createdAlert),
    };
    vi.mocked(createAlertService).mockReturnValue(mockService as any);

    const request = new Request("https://example.com/v1/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRequest),
    });
    const env = createEnv();
    const logger = createMockLogger();
    const alertService = createAlertService(env, logger);
    const controller = new AlertController(alertService, logger, env);
    const response = await controller.createAlert(request);
    
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(validateAlert(data.alert)).toBe(true);
    expect(data.alert.symbol).toBe("AAPL");
    expect(data.alert.threshold).toBe(200);
  });

  it("successfully updates an alert", async () => {
    const updateRequest = {
      status: "paused" as const,
    };

    const alertId = "123e4567-e89b-12d3-a456-426614174000";
    const updatedAlert = {
      id: alertId,
      symbol: "AAPL",
      direction: "above" as const,
      threshold: 200,
      status: "paused" as const,
      channel: "notification" as const,
      username: "testuser",
      notes: null,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-02T00:00:00.000Z",
    };

    const mockService = {
      updateAlert: vi.fn().mockResolvedValue(updatedAlert),
    };
    vi.mocked(createAlertService).mockReturnValue(mockService as any);

    const request = new Request(`https://example.com/v1/api/alerts/${alertId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateRequest),
    });
    const env = createEnv();
    const logger = createMockLogger();
    const alertService = createAlertService(env, logger);
    const controller = new AlertController(alertService, logger, env);
    const response = await controller.updateAlert(request, alertId);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateAlert(data.alert)).toBe(true);
    expect(data.alert.status).toBe("paused");
  });

  it("successfully deletes an alert", async () => {
    const alertId = "123e4567-e89b-12d3-a456-426614174001";
    const mockService = {
      deleteAlert: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(createAlertService).mockReturnValue(mockService as any);

    const request = new Request(`https://example.com/v1/api/alerts/${alertId}`, {
      method: "DELETE",
    });
    const env = createEnv();
    const logger = createMockLogger();
    const alertService = createAlertService(env, logger);
    const controller = new AlertController(alertService, logger, env);
    const response = await controller.deleteAlert(request, alertId);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("success", true);
  });

  it("returns 404 when alert not found", async () => {
    const alertId = "550e8400-e29b-41d4-a716-446655440999";
    const mockService = {
      getAlert: vi.fn().mockResolvedValue(null),
    };
    vi.mocked(createAlertService).mockReturnValue(mockService as any);

    const request = new Request(`https://example.com/v1/api/alerts/${alertId}`, { method: "GET" });
    const env = createEnv();
    const logger = createMockLogger();
    const alertService = createAlertService(env, logger);
    const controller = new AlertController(alertService, logger, env);
    const response = await controller.getAlert(request, alertId);
    
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
  });
});

