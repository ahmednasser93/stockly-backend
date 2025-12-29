/**
 * API SCHEMA VALIDATION TESTS
 * 
 * These tests ensure all API endpoints return data that matches the strict schemas
 * defined in test/schemas.ts. These schemas define the contract between the API
 * and its clients.
 * 
 * ⚠️ DO NOT MODIFY THESE TESTS WITHOUT UPDATING THE SCHEMAS FIRST
 * See TEST_SCHEMA_RULES.md for details.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  validateStockQuoteResponse,
  validateStockQuotesResponse,
  validateAlertsListResponse,
  validateAlert,
  validateCreateAlertRequest,
  validateUpdateAlertRequest,
  validateHistoricalPricesResponse,
  validateHealthCheckResponse,
  validateErrorResponse,
  type StockQuoteResponse,
  type Alert,
  type CreateAlertRequest,
  type UpdateAlertRequest,
} from "./schemas";
import { QuotesController } from "../src/controllers/quotes.controller";
import { createQuotesService } from "../src/factories/createQuotesService";
import { SearchController } from "../src/controllers/search.controller";
import { createSearchService } from "../src/factories/createSearchService";
import { HistoricalController } from "../src/controllers/historical.controller";
import { createHistoricalService } from "../src/factories/createHistoricalService";
import { D1DatabaseWrapper } from "../src/infrastructure/database/D1Database";
import { AlertController } from "../src/controllers/alerts.controller";
import { clearCache } from "../src/api/cache";
import { clearConfigCache } from "../src/api/config";
import { createAlertService } from "../src/factories/createAlertService";
import { healthCheck } from "../src/api/health";
vi.mock("../src/factories/createAlertService", () => ({
  createAlertService: vi.fn(),
}));

vi.mock("../src/auth/middleware", () => ({
  authenticateRequest: vi.fn(),
  authenticateRequestWithAdmin: vi.fn(),
}));

import { authenticateRequestWithAdmin } from "../src/auth/middleware";

import { API_KEY, API_URL } from "../src/util";
import { clearCache } from "../src/api/cache";
import type { Env } from "../src/index";
import { createMockLogger } from "./test-utils";

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
// HEALTH CHECK SCHEMA TESTS
// ============================================================================

describe("API Schema Validation - Health Check", () => {
  it("health endpoint returns valid HealthCheckResponse schema", async () => {
    const response = await healthCheck();
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(validateHealthCheckResponse(data)).toBe(true);
    expect(data).toHaveProperty("status", "ok");
  });
});

// ============================================================================
// GET STOCK SCHEMA TESTS
// ============================================================================

describe("API Schema Validation - Get Stock", () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  it("getStock returns valid StockQuoteResponse schema on success", async () => {
    const quote: Partial<StockQuoteResponse> = {
      symbol: "AAPL",
      name: "Apple Inc.",
      price: 175.50,
      change: 1.25,
      changePercentage: 0.72,
      volume: 50000000,
      dayLow: 174.00,
      dayHigh: 176.00,
      image: "https://images.financialmodelingprep.com/symbol/AAPL.png",
      description: "Apple Inc. designs and manufactures...",
    };

    // Mock fetch - profile fetcher tries endpoints sequentially, first one succeeds
    // Reset counter at start of each test
    (globalThis as any).__profileCallCount = 0;
    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      if (url.includes("/quote?")) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ 
            ...quote, 
            image: quote.image || `https://images.financialmodelingprep.com/symbol/${quote.symbol}.png`,
            changePercentage: quote.changePercentage,
          }],
        } as Response);
      }
      if (url.includes("/profile")) {
        (globalThis as any).__profileCallCount++;
        // First profile endpoint call succeeds
        if ((globalThis as any).__profileCallCount === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => [{ 
              ...quote, 
              description: quote.description, 
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
      if (url.includes("wikipedia.org")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ extract: quote.description || "Company description" }),
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
    const quotesService = createQuotesService(env, logger);
    const db = new D1DatabaseWrapper(env.stockly, logger);
    const controller = new QuotesController(quotesService, logger, env, db);
    const response = await controller.getStock(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateStockQuoteResponse(data)).toBe(true);
    expect(data).toHaveProperty("symbol", "AAPL");
    expect(data).toHaveProperty("price");
    expect(typeof data.price).toBe("number");
  });

  it("getStock returns valid ErrorResponse schema on error", async () => {
    const env = createEnv();
    const request = createRequest("/v1/api/get-stock");
    const logger = createMockLogger();
    const quotesService = createQuotesService(env, logger);
    const db = new D1DatabaseWrapper(env.stockly, logger);
    const controller = new QuotesController(quotesService, logger, env, db);
    const response = await controller.getStock(request);
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
    expect(data).toHaveProperty("error");
    // Error can be string or object with code/message
    if (typeof data.error === 'string') {
      expect(typeof data.error).toBe("string");
    } else {
      expect(data.error).toHaveProperty("code");
      expect(data.error).toHaveProperty("message");
    }
  });
});

// ============================================================================
// GET STOCKS SCHEMA TESTS
// ============================================================================

describe("API Schema Validation - Get Stocks", () => {
  beforeEach(() => {
    clearCache();
    clearConfigCache();
    vi.restoreAllMocks();
    // Reset profile call counter for each test
    (globalThis as any).__profileCallCounts = new Map<string, number>();
  });

  it("getStocks returns valid StockQuotesResponse schema on success", async () => {
    const quotes: Partial<StockQuoteResponse>[] = [
      { symbol: "AAPL", name: "Apple Inc.", price: 175.50, change: 1.25, changePercentage: 0.72 },
      { symbol: "MSFT", name: "Microsoft Corp.", price: 350.00, change: -2.00, changePercentage: -0.57 },
    ];

    vi.spyOn(globalThis as any, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => quotes,
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => [{ description: "Test" }],
      } as Response);

    const env = createEnv();
    const request = createRequest("/v1/api/get-stocks", { symbols: "AAPL,MSFT" });
    const logger = createMockLogger();
    const quotesService = createQuotesService(env, logger);
    const db = new D1DatabaseWrapper(env.stockly, logger);
    const controller = new QuotesController(quotesService, logger, env, db);
    const response = await controller.getStocks(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateStockQuotesResponse(data)).toBe(true);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    data.forEach((quote) => {
      expect(validateStockQuoteResponse(quote)).toBe(true);
    });
  });

  it("getStocks returns valid ErrorResponse schema on error", async () => {
    const env = createEnv();
    const request = createRequest("/v1/api/get-stocks");
    const logger = createMockLogger();
    const quotesService = createQuotesService(env, logger);
    const db = new D1DatabaseWrapper(env.stockly, logger);
    const controller = new QuotesController(quotesService, logger, env, db);
    const response = await controller.getStocks(request);
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
  });
});

// ============================================================================
// SEARCH STOCK SCHEMA TESTS
// ============================================================================

describe("API Schema Validation - Search Stock", () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  it("searchStock returns valid SearchStockResponse schema", async () => {
    const results = [
      { symbol: "AAPL", name: "Apple Inc.", currency: "USD", exchangeFullName: "NASDAQ" },
      { symbol: "AMZN", name: "Amazon.com Inc.", currency: "USD", exchangeFullName: "NASDAQ" },
    ];

    vi.spyOn(globalThis as any, "fetch").mockResolvedValue({
      ok: true,
      json: async () => results,
    } as Response);

    const env = createEnv();
    const request = createRequest("/v1/api/search-stock", { query: "AP" });
    const searchService = createSearchService(env, createMockLogger());
    const controller = new SearchController(searchService, createMockLogger(), env);
    const response = await controller.searchStock(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    data.forEach((item) => {
      expect(item).toHaveProperty("symbol");
      expect(item).toHaveProperty("name");
      expect(typeof item.symbol).toBe("string");
      expect(typeof item.name).toBe("string");
    });
  });
});

// ============================================================================
// GET HISTORICAL SCHEMA TESTS
// ============================================================================

describe("API Schema Validation - Get Historical", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("getHistorical returns valid HistoricalPricesResponse schema", async () => {
    const env = createEnv();
    const bind = vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue({
        results: [
          { date: "2025-01-01", price: 175.50, volume: 50000000 },
          { date: "2025-01-02", price: 176.00, volume: 51000000 },
        ],
      }),
    });
    env.stockly.prepare = vi.fn().mockReturnValue({ bind });

    const request = createRequest("/v1/api/get-historical", { symbol: "AAPL", days: "180" });
    const historicalService = createHistoricalService(env, createMockLogger());
    const controller = new HistoricalController(historicalService, createMockLogger(), env);
    const response = await controller.getHistorical(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateHistoricalPricesResponse(data)).toBe(true);
    expect(data).toHaveProperty("symbol");
    expect(data).toHaveProperty("days");
    expect(data).toHaveProperty("data");
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("getHistorical returns valid ErrorResponse schema on error", async () => {
    const env = createEnv();
    const request = createRequest("/v1/api/get-historical");
    const historicalService = createHistoricalService(env, createMockLogger());
    const controller = new HistoricalController(historicalService, createMockLogger(), env);
    const response = await controller.getHistorical(request);
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
  });
});

// ============================================================================
// ALERTS SCHEMA TESTS
// ============================================================================

describe("API Schema Validation - Alerts", () => {
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

  it("listAlerts returns valid AlertsListResponse schema", async () => {
    const alerts = [
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
      listAlerts: vi.fn().mockResolvedValue(alerts),
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
    expect(data).toHaveProperty("alerts");
    expect(Array.isArray(data.alerts)).toBe(true);
    data.alerts.forEach((alert) => {
      expect(validateAlert(alert)).toBe(true);
    });
  });

  it("createAlert accepts valid CreateAlertRequest schema", async () => {
    const createRequest = {
      symbol: "AAPL",
      direction: "above" as const,
      threshold: 200,
      channel: "notification" as const,
    };

    const created = {
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
      createAlert: vi.fn().mockResolvedValue(created),
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
  });

  it("updateAlert accepts valid UpdateAlertRequest schema", async () => {
    const updateRequest: UpdateAlertRequest = {
      status: "paused",
    };

    expect(validateUpdateAlertRequest(updateRequest)).toBe(true);

    const alertId = "123e4567-e89b-12d3-a456-426614174000";
    const updated = {
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
      updateAlert: vi.fn().mockResolvedValue(updated),
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
  });

  it("getAlert returns valid Alert schema", async () => {
    const alertId = "123e4567-e89b-12d3-a456-426614174000";
    const alert = {
      id: alertId,
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
      getAlert: vi.fn().mockResolvedValue(alert),
    };
    vi.mocked(createAlertService).mockReturnValue(mockService as any);

    const request = new Request(`https://example.com/v1/api/alerts/${alertId}`, { method: "GET" });
    const env = createEnv();
    const logger = createMockLogger();
    const alertService = createAlertService(env, logger);
    const controller = new AlertController(alertService, logger, env);
    const response = await controller.getAlert(request, alertId);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateAlert(data.alert)).toBe(true);
  });
});

// ============================================================================
// INPUT VALIDATION TESTS
// ============================================================================

describe("API Schema Validation - Input Validation", () => {
  it("rejects invalid CreateAlertRequest", () => {
    const invalidRequests = [
      {}, // missing required fields
      { symbol: "AAPL" }, // missing other required fields
      { symbol: "AAPL", direction: "invalid" }, // invalid enum
      { symbol: "AAPL", direction: "above", threshold: "not-a-number" }, // invalid type
    ];

    invalidRequests.forEach((request) => {
      expect(validateCreateAlertRequest(request)).toBe(false);
    });
  });

  it("accepts valid CreateAlertRequest with optional fields", () => {
    const validRequest: CreateAlertRequest = {
      symbol: "AAPL",
      direction: "above",
      threshold: 200,
      channel: "notification",
      target: "test@example.com",
      notes: "Test alert",
    };

    expect(validateCreateAlertRequest(validRequest)).toBe(true);
  });

  it("rejects invalid UpdateAlertRequest", () => {
    const invalidRequests = [
      { status: "invalid" }, // invalid enum
      { threshold: "not-a-number" }, // invalid type
      { direction: "left" }, // invalid enum
    ];

    invalidRequests.forEach((request) => {
      expect(validateUpdateAlertRequest(request)).toBe(false);
    });
  });

  it("accepts partial UpdateAlertRequest", () => {
    const validPartialUpdates = [
      { status: "paused" },
      { threshold: 250 },
      { direction: "below" },
      { notes: null },
      {}, // empty is valid (no-op update)
    ];

    validPartialUpdates.forEach((update) => {
      expect(validateUpdateAlertRequest(update)).toBe(true);
    });
  });
});

