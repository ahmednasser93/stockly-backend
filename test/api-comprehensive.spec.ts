/**
 * COMPREHENSIVE API TESTS
 * 
 * Tests for ALL endpoints documented in API_DOCUMENTATION.md
 * Ensures all endpoints work as expected per the documentation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { healthCheck } from "../src/api/health";
import { QuotesController } from "../src/controllers/quotes.controller";
import { createQuotesService } from "../src/factories/createQuotesService";
import { D1DatabaseWrapper } from "../src/infrastructure/database/D1Database";
import { StockController } from "../src/controllers/stocks.controller";
import { createStockService } from "../src/factories/createStockService";
import { NewsController } from "../src/controllers/news.controller";
import { createNewsService } from "../src/factories/createNewsService";
import { SearchController } from "../src/controllers/search.controller";
import { createSearchService } from "../src/factories/createSearchService";
import { HistoricalController } from "../src/controllers/historical.controller";
import { createHistoricalService } from "../src/factories/createHistoricalService";
import { AlertController } from "../src/controllers/alerts.controller";
import { createAlertService } from "../src/factories/createAlertService";
import { registerPushToken, getPushToken } from "../src/api/push-token";
import { getPreferences, updatePreferences } from "../src/api/preferences";
import { getSettings, updateSettings } from "../src/api/settings";
import { getRecentNotifications, getFailedNotifications, retryNotification } from "../src/api/admin";
import { getAllDevices, sendTestNotification, deleteDevice } from "../src/api/devices";
import { getConfigEndpoint, updateConfigEndpoint, simulateProviderFailureEndpoint, disableProviderFailureEndpoint } from "../src/api/config";
import { getOpenApiSpec } from "../src/api/openapi";
import { clearCache } from "../src/api/cache";
import { clearConfigCache } from "../src/api/config";
import type { Env } from "../src/index";
import { createMockLogger } from "./test-utils";
import { validateErrorResponse } from "./schemas";

vi.mock("../src/factories/createAlertService", () => ({
  createAlertService: vi.fn(),
}));

// Don't mock these - let them create real services for integration tests
// vi.mock("../src/factories/createQuotesService", () => ({
//   createQuotesService: vi.fn(),
// }));

// vi.mock("../src/factories/createSearchService", () => ({
//   createSearchService: vi.fn(),
// }));

// vi.mock("../src/factories/createHistoricalService", () => ({
//   createHistoricalService: vi.fn(),
// }));

vi.mock("../src/factories/createNewsService", () => ({
  createNewsService: vi.fn(),
}));

vi.mock("../src/auth/middleware", () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    username: "testuser",
    tokenType: "access" as const,
  }),
  authenticateRequestWithAdmin: vi.fn().mockResolvedValue({
    username: "testuser",
    tokenType: "access" as const,
    isAdmin: false,
  }),
}));

import { authenticateRequest, authenticateRequestWithAdmin } from "../src/auth/middleware";

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

const createRequest = (path: string, params: Record<string, string> = {}, init?: RequestInit) => {
  const url = createUrl(path, params);
  return new Request(url.toString(), init);
};

const createEnv = (): Env => {
  const run = vi.fn().mockResolvedValue({
    success: true,
    meta: {
      changes: 1,
      last_row_id: 1,
    },
  });
  const first = vi.fn().mockResolvedValue(null);
  const all = vi.fn().mockResolvedValue({ results: [] });
  const bind = vi.fn().mockReturnValue({ 
    run, 
    first,
    all,
  });
  const prepare = vi.fn().mockReturnValue({ bind });
  return {
    stockly: { prepare } as any,
    alertsKv: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as any,
    JWT_SECRET: "test-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
  };
};

// ============================================================================
// HEALTH CHECK TESTS
// ============================================================================

describe("API - Health Check", () => {
  it("GET /v1/api/health returns OK status", async () => {
    const response = await healthCheck();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ status: "ok" });
  });
});

// ============================================================================
// STOCK QUOTES TESTS
// ============================================================================

describe("API - Get Single Stock", () => {
  beforeEach(() => {
    clearCache();
    clearConfigCache();
    vi.restoreAllMocks();
    // Reset profile call counter for each test
    (globalThis as any).__profileCallCount = 0;
  });

  it("GET /v1/api/get-stock returns stock data with all required fields", async () => {
    const mockQuote = {
      symbol: "AAPL",
      name: "Apple Inc.",
      price: 195.50,
      change: 2.50,
      changePercent: 1.30,
      volume: 50000000,
      dayLow: 193.00,
      dayHigh: 196.00,
      yearLow: 150.00,
      yearHigh: 200.00,
      marketCap: 3000000000000,
      exchange: "NASDAQ",
      image: "https://images.financialmodelingprep.com/symbol/AAPL.png",
      description: "Apple Inc. designs and manufactures...",
    };

    // Mock fetch - profile fetcher tries 4 endpoints sequentially, first one succeeds
    // Reset counter at start of each test
    (globalThis as any).__profileCallCount = 0;
    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      if (url.includes("/quote?")) {
        return Promise.resolve({
          ok: true,
          json: async () => [mockQuote],
        } as Response);
      }
      if (url.includes("/profile")) {
        (globalThis as any).__profileCallCount++;
        // First profile endpoint call succeeds (stops trying others)
        if ((globalThis as any).__profileCallCount === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => [{ 
              ...mockQuote, 
              description: mockQuote.description,
              symbol: mockQuote.symbol,
              Symbol: mockQuote.symbol,
              image: mockQuote.image || `https://images.financialmodelingprep.com/symbol/${mockQuote.symbol}.png`,
            }],
          } as Response);
        }
        // Subsequent calls return empty (shouldn't happen, but handle gracefully)
        return Promise.resolve({
          ok: true,
          json: async () => [],
        } as Response);
      }
      if (url.includes("wikipedia.org")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ extract: mockQuote.description }),
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
    expect(data.symbol).toBe("AAPL");
    expect(data.price).toBe(195.50);
    expect(data.name).toBe("Apple Inc.");
    expect(data.image).toBeTruthy();
    expect(data.change).toBe(2.50);
    expect(data.changePercentage || data.changePercent).toBeDefined();
  });

  it("GET /v1/api/get-stock returns 400 when symbol is missing", async () => {
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
    // Error message should indicate missing required field (symbol)
    if (typeof data.error === 'string') {
      expect(data.error.toLowerCase()).toMatch(/symbol|required/);
    } else if (data.error?.message) {
      expect(data.error.message.toLowerCase()).toMatch(/symbol|required/);
    }
  });
});

describe("API - Get Multiple Stocks", () => {
  beforeEach(() => {
    clearCache();
    clearConfigCache();
    vi.restoreAllMocks();
    // Reset profile call counter for each test
    (globalThis as any).__profileCallCounts = new Map<string, number>();
  });

  it("GET /v1/api/get-stocks returns array of stocks with all fields", async () => {
    const mockQuotes = [
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        price: 195.50,
        change: 2.50,
        changePercent: 1.30,
      },
      {
        symbol: "MSFT",
        name: "Microsoft Corporation",
        price: 420.75,
        change: -5.25,
        changePercent: -1.23,
      },
    ];

    // Mock fetch - profile fetcher tries endpoints sequentially, first one succeeds per symbol
    // Reset counter at start of each test
    (globalThis as any).__profileCallCounts = new Map<string, number>();
    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      if (url.includes("/quote?")) {
        const symbol = url.match(/symbol=([^&]+)/)?.[1];
        const quote = mockQuotes.find(q => q.symbol === symbol?.toUpperCase());
        if (!quote) {
          return Promise.resolve({
            ok: false,
            status: 404,
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => [{ ...quote, image: quote.image || `https://images.financialmodelingprep.com/symbol/${quote.symbol}.png` }],
        } as Response);
      }
      if (url.includes("/profile")) {
        const symbol = url.match(/symbol=([^&]+)/)?.[1] || url.match(/profile\/([^?]+)/)?.[1] || "";
        const callCount = ((globalThis as any).__profileCallCounts.get(symbol) || 0) + 1;
        (globalThis as any).__profileCallCounts.set(symbol, callCount);
        const quote = mockQuotes.find(q => q.symbol === symbol?.toUpperCase());
        if (quote && callCount === 1) {
          // First profile endpoint call for this symbol succeeds (stops trying others)
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
        // Subsequent calls return empty (shouldn't happen, but handle gracefully)
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
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });

    const env = createEnv();
    const request = createRequest("/v1/api/get-stocks", { symbols: "AAPL,MSFT" });
    const logger = createMockLogger();
    const quotesService = createQuotesService(env, logger);
    const db = new D1DatabaseWrapper(env.stockly, logger);
    const controller = new QuotesController(quotesService, logger, env, db);
    const response = await controller.getStocks(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    data.forEach((stock) => {
      expect(stock.symbol).toBeTruthy();
      expect(stock.name).toBeTruthy();
      expect(stock.price).toBeTruthy();
      expect(stock.image).toBeTruthy();
    });
  });

  it("GET /v1/api/get-stocks returns 400 when symbols parameter is missing", async () => {
    const env = createEnv();
    const request = createRequest("/v1/api/get-stocks");
    const logger = createMockLogger();
    const quotesService = createQuotesService(env, logger);
    const db = new D1DatabaseWrapper(env.stockly, logger);
    const controller = new QuotesController(quotesService, logger, env, db);
    const response = await controller.getStocks(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
    // Error can be either { code, message } or just a string
    const errorMessage = typeof data.error === 'string' ? data.error : (data.error.message || data.error.code || '');
    expect(errorMessage.toLowerCase()).toMatch(/symbols|required|invalid/i);
  });
});

describe("API - Search Stocks", () => {
  it("GET /v1/api/search-stock returns matching stocks", async () => {
    const mockResults = [
      { symbol: "AAPL", name: "Apple Inc.", currency: "USD", stockExchange: "NASDAQ" },
      { symbol: "APTV", name: "Aptiv PLC", currency: "USD", stockExchange: "NYSE" },
    ];

    vi.spyOn(globalThis as any, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    } as Response);

    const env = createEnv();
    const request = createRequest("/v1/api/search-stock", { query: "AP" });
    const searchService = createSearchService(env, createMockLogger());
    const controller = new SearchController(searchService, createMockLogger(), env);
    const response = await controller.searchStock(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    data.forEach((item) => {
      expect(item).toHaveProperty("symbol");
      expect(item).toHaveProperty("name");
      if (item.currency) {
        expect(typeof item.currency).toBe("string");
      }
    });
  });

  it("GET /v1/api/search-stock returns empty array when query is missing", async () => {
    const env = createEnv();
    const request = createRequest("/v1/api/search-stock");
    const logger = createMockLogger();
    const searchService = createSearchService(env, logger);
    const controller = new SearchController(searchService, logger, env);
    const response = await controller.searchStock(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });
});

// ============================================================================
// HISTORICAL PRICES TESTS
// ============================================================================

describe("API - Get Historical", () => {
  it("GET /v1/api/get-historical returns historical data", async () => {
    const mockData = {
      results: [
        { date: "2025-01-01", price: 195.50, volume: 50000000 },
        { date: "2025-01-02", price: 196.00, volume: 52000000 },
      ],
    };

    const env = createEnv();
    const bind = vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue(mockData),
    });
    env.stockly.prepare = vi.fn().mockReturnValue({ bind });

    const request = createRequest("/v1/api/get-historical", { symbol: "AAPL", days: "180" });
    const logger = createMockLogger();
    const historicalService = createHistoricalService(env, logger);
    const controller = new HistoricalController(historicalService, logger, env);
    const response = await controller.getHistorical(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.symbol).toBe("AAPL");
    expect(data.days).toBe(180);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("GET /v1/api/get-historical returns 400 when symbol is missing", async () => {
    const env = createEnv();
    const request = createRequest("/v1/api/get-historical");
    const logger = createMockLogger();
    const historicalService = createHistoricalService(env, logger);
    const controller = new HistoricalController(historicalService, logger, env);
    const response = await controller.getHistorical(request);
    expect(response.status).toBe(400);
  });
});

// ============================================================================
// ALERTS TESTS
// ============================================================================

describe("API - Alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup the auth mocks after clearing
    vi.mocked(authenticateRequest).mockResolvedValue({
      username: "testuser",
      tokenType: "access" as const,
    });
    vi.mocked(authenticateRequestWithAdmin).mockResolvedValue({
      username: "testuser",
      tokenType: "access" as const,
      isAdmin: false,
    } as any);
  });

  it("GET /v1/api/alerts lists all alerts", async () => {
    const mockAlerts = [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
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
    expect(data.alerts).toBeDefined();
    expect(Array.isArray(data.alerts)).toBe(true);
  });

  it("POST /v1/api/alerts creates a new alert", async () => {
    const createRequest = {
      symbol: "AAPL",
      direction: "above" as const,
      threshold: 200,
      channel: "notification" as const,
    };

    const createdAlert = {
      id: "550e8400-e29b-41d4-a716-446655440001",
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
    expect(data.alert.symbol).toBe("AAPL");
    expect(data.alert.threshold).toBe(200);
  });

  it("GET /v1/api/alerts/:id gets a specific alert", async () => {
    const mockAlert = {
      id: "550e8400-e29b-41d4-a716-446655440002",
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
      getAlert: vi.fn().mockResolvedValue(mockAlert),
    };
    vi.mocked(createAlertService).mockReturnValue(mockService as any);

    const alertId = "550e8400-e29b-41d4-a716-446655440002";
    const request = new Request(`https://example.com/v1/api/alerts/${alertId}`, { method: "GET" });
    const env = createEnv();
    const logger = createMockLogger();
    const alertService = createAlertService(env, logger);
    const controller = new AlertController(alertService, logger, env);
    const response = await controller.getAlert(request, alertId);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.alert.id).toBe(alertId);
  });

  it("PUT /v1/api/alerts/:id updates an alert", async () => {
    const updateRequest = { status: "paused" as const };

    const updatedAlert = {
      id: "550e8400-e29b-41d4-a716-446655440003",
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

    const alertId = "550e8400-e29b-41d4-a716-446655440003";
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
    expect(data.alert.status).toBe("paused");
  });

  it("DELETE /v1/api/alerts/:id deletes an alert", async () => {
    const mockService = {
      deleteAlert: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(createAlertService).mockReturnValue(mockService as any);

    const alertId = "550e8400-e29b-41d4-a716-446655440004";
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
    expect(data.success).toBe(true);
  });
});

// ============================================================================
// PUSH TOKEN TESTS
// ============================================================================

describe("API - Push Token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequest).mockResolvedValue({
      username: "testuser",
      tokenType: "access" as const,
    });
  });

  it("POST /v1/api/push-token registers a new push token", async () => {
    const payload = {
      token: "fcm-token-12345678901234567890",
      deviceInfo: "iPhone 14 Pro",
    };

    const env = createEnv();
    let callCount = 0;
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
    const bind = vi.fn().mockReturnValue({
        first: vi.fn().mockImplementation(() => {
          const result = callCount === 0 
            ? { id: "user-123", username: "testuser" } // User lookup
            : callCount === 1
            ? null // Device check (not found)
            : callCount === 2
            ? null // Token check (not found)
            : { id: 1, user_id: "user-123", device_info: "iPhone 14 Pro", device_type: "ios", push_token: "fcm-token-12345678901234567890" }; // Verification query
          callCount++;
          return Promise.resolve(result);
        }),
      run: vi.fn().mockResolvedValue({ meta: { last_row_id: callCount === 2 ? 1 : undefined } }),
    });
      return { bind };
    });

    const request = new Request("https://example.com/v1/api/push-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const response = await registerPushToken(request, env, createMockLogger());
    
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.username).toBe("testuser");
  });

  it("POST /v1/api/push-token updates existing push token", async () => {
    const payload = {
      token: "fcm-token-12345678901234567890",
      deviceInfo: "iPhone 15 Pro",
    };

    const env = createEnv();
    let callCount = 0;
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
    const bind = vi.fn().mockReturnValue({
        first: vi.fn().mockImplementation(() => {
          const result = callCount === 0 
            ? { id: "user-123", username: "testuser" } // User lookup
            : callCount === 1
            ? { id: 1, user_id: "user-123", device_info: "iPhone 14 Pro", device_type: "ios", is_active: 1 } // Device check (found)
            : callCount === 2
            ? { id: 1, device_id: 1, is_active: 1 } // Token check (found, same device)
            : { id: 1, user_id: "user-123", device_info: "iPhone 15 Pro", device_type: "ios", push_token: "fcm-token-12345678901234567890" }; // Verification query
          callCount++;
          return Promise.resolve(result);
        }),
      run: vi.fn().mockResolvedValue(undefined),
    });
      return { bind };
    });

    const request = new Request("https://example.com/v1/api/push-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const response = await registerPushToken(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("Push token updated");
  });

  it("POST /v1/api/push-token returns 400 for invalid token format", async () => {
    const payload = {
      token: "short-token", // Too short
    };

    const request = new Request("https://example.com/v1/api/push-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const env = createEnv();
    // Mock user lookup (validation happens before token format check in some cases)
    env.stockly.prepare = vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: "user-123", username: "testuser" }),
      }),
    });
    const response = await registerPushToken(request, env, createMockLogger());
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid FCM token format");
  });

  it("GET /v1/api/push-token gets a user's push token", async () => {
    // Mock devices query (new schema) - returns rows with device_id, device_info, device_type, push_token
    const mockDevices = [
      {
        device_id: 1,
        device_info: "iPhone 14 Pro",
        device_type: "ios",
        push_token: "fcm-token-12345678901234567890",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      },
    ];

    const env = createEnv();
    let callCount = 0;
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
      const bind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(
          callCount++ === 0 
            ? { id: "user-123" } // User lookup
            : null
        ),
        all: vi.fn().mockResolvedValue({ results: mockDevices }), // Devices with push tokens
      });
      return { bind };
    });

    const request = new Request("https://example.com/v1/api/push-token");
    const response = await getPushToken(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.username).toBe("testuser");
    expect(Array.isArray(data.devices)).toBe(true);
    // New schema returns devices with pushTokens arrays (array of objects with pushToken, createdAt, updatedAt)
    expect(Array.isArray(data.devices[0].pushTokens)).toBe(true);
    expect(data.devices[0].pushTokens[0].pushToken).toBe("fcm-token-12345678901234567890");
  });

  it("GET /v1/api/push-token returns 404 when token not found", async () => {
    const env = createEnv();
    let callCount = 0;
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
    const bind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(
          callCount++ === 0 
            ? { id: "user-123" } // User lookup
            : null
        ),
        all: vi.fn().mockResolvedValue({ results: [] }), // No push tokens
      });
      return { bind };
    });

    const request = new Request("https://example.com/v1/api/push-token");
    const response = await getPushToken(request, env, createMockLogger());
    
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("not found");
  });

  it("GET /v1/api/push-token?check=true&token=XXX returns registered status for specific token", async () => {
    const testToken = "fcm-token-12345678901234567890";
    const env = createEnv();
    let callCount = 0;
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
      const bind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(
          callCount++ === 0 
            ? { id: "user-123" } // User lookup
            : { user_id: "user-123" } // Token check - token is registered
        ),
        all: vi.fn().mockResolvedValue({ results: [] }),
      });
      return { bind };
    });

    const request = new Request(`https://example.com/v1/api/push-token?check=true&token=${encodeURIComponent(testToken)}`);
    const response = await getPushToken(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.registered).toBe(true);
  });

  it("GET /v1/api/push-token?check=true&token=XXX returns registered=false when token not found", async () => {
    const testToken = "fcm-token-unregistered";
    const env = createEnv();
    let callCount = 0;
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
      const bind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(
          callCount++ === 0 
            ? { id: "user-123" } // User lookup
            : null // Token check - token not found
        ),
        all: vi.fn().mockResolvedValue({ results: [] }),
      });
      return { bind };
    });

    const request = new Request(`https://example.com/v1/api/push-token?check=true&token=${encodeURIComponent(testToken)}`);
    const response = await getPushToken(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.registered).toBe(false);
  });

  it("GET /v1/api/push-token?check=true returns 400 when token parameter missing", async () => {
    const env = createEnv();
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
      const bind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: "user-123" }), // User lookup
        all: vi.fn().mockResolvedValue({ results: [] }),
      });
      return { bind };
    });

    const request = new Request("https://example.com/v1/api/push-token?check=true");
    const response = await getPushToken(request, env, createMockLogger());
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("token parameter required");
  });
});

// ============================================================================
// PREFERENCES TESTS
// ============================================================================

describe("API - Preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequest).mockResolvedValue({
      username: "testuser",
      tokenType: "access" as const,
    });
  });

  it("GET /v1/api/preferences gets user preferences", async () => {
    const mockPreferences = {
      user_id: "user-123",
      enabled: 1,
      quiet_start: "22:00",
      quiet_end: "08:00",
      allowed_symbols: '["AAPL", "MSFT"]',
      max_daily: 10,
      updated_at: "2025-01-01T00:00:00Z",
    };

    const env = createEnv();
    let callCount = 0;
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
    const bind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(
          callCount++ === 0 
            ? { id: "user-123" } // User lookup
            : mockPreferences // Preferences
        ),
    });
      return { bind };
    });

    const request = new Request("https://example.com/v1/api/preferences");
    const response = await getPreferences(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.userId).toBe("user-123");
    expect(data.enabled).toBe(true);
  });

  it("GET /v1/api/preferences returns default preferences when not found", async () => {
    const env = createEnv();
    let callCount = 0;
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
    const bind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(
          callCount++ === 0 
            ? { id: "user-123" } // User lookup
            : null // No preferences found
        ),
    });
      return { bind };
    });

    const request = new Request("https://example.com/v1/api/preferences");
    const response = await getPreferences(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.userId).toBe("user-123");
    expect(data.enabled).toBe(true); // Default
  });

  it("PUT /v1/api/preferences updates user preferences", async () => {
    const payload = {
      enabled: true,
      quietStart: "22:00",
      quietEnd: "08:00",
      allowedSymbols: ["AAPL", "MSFT"],
      maxDaily: 10,
    };

    const env = createEnv();
    let callCount = 0;
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
    const bind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(
          callCount++ === 0 
            ? { id: "user-123" } // User lookup
            : null // No existing preferences
        ),
      run: vi.fn().mockResolvedValue(undefined),
    });
      return { bind };
    });

    const request = new Request("https://example.com/v1/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const response = await updatePreferences(request, env, createMockLogger());
    
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});

// ============================================================================
// SETTINGS TESTS
// ============================================================================

describe("API - Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequest).mockResolvedValue({
      username: "testuser",
      tokenType: "access" as const,
    });
  });

  it("GET /v1/api/settings gets user settings", async () => {
    const env = createEnv();
    const logger = createMockLogger();
    const bind = vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue({
        user_id: "user-123",
        username: "testuser",
        refresh_interval_minutes: 10,
        cache_stale_time_minutes: 8,
        cache_gc_time_minutes: 15,
        news_favorite_symbols: null,
        updated_at: "2025-01-01T00:00:00Z",
      }),
    });
    env.stockly.prepare = vi.fn().mockReturnValue({ bind });

    const request = new Request("https://example.com/v1/api/settings");
    const response = await getSettings(request, env, logger);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.userId).toBe("user-123");
    expect(data.refreshIntervalMinutes).toBe(10);
    expect(data.cacheStaleTimeMinutes).toBe(8);
    expect(data.cacheGcTimeMinutes).toBe(15);
  });

  it("GET /v1/api/settings returns default settings when not found", async () => {
    const env = createEnv();
    const logger = createMockLogger();
    let callCount = 0;
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
    const bind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(
          callCount++ === 0 
            ? null // No settings found
            : { id: "user-123" } // User lookup for default
        ),
    });
      return { bind };
    });

    const request = new Request("https://example.com/v1/api/settings");
    const response = await getSettings(request, env, logger);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.userId).toBe("user-123");
    expect(data.refreshIntervalMinutes).toBe(5); // Default
    expect(data.cacheStaleTimeMinutes).toBe(5); // Default
    expect(data.cacheGcTimeMinutes).toBe(10); // Default
  });

  it("PUT /v1/api/settings updates user settings", async () => {
    const payload = {
      refreshIntervalMinutes: 15,
      cacheStaleTimeMinutes: 8,
      cacheGcTimeMinutes: 15,
    };

    const env = createEnv();
    const logger = createMockLogger();
    let callCount = 0;
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
    const bind = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(
          callCount++ === 0 
            ? { id: "user-123" } // User lookup
            : null // No existing settings
        ),
      run: vi.fn().mockResolvedValue(undefined),
    });
      return { bind };
    });

    const request = new Request("https://example.com/v1/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const response = await updateSettings(request, env, logger);
    
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.settings.refreshIntervalMinutes).toBe(15);
    expect(data.settings.cacheStaleTimeMinutes).toBe(8);
    expect(data.settings.cacheGcTimeMinutes).toBe(15);
  });
});

// ============================================================================
// NOTIFICATIONS TESTS
// ============================================================================

describe("API - Notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequestWithAdmin).mockResolvedValue({
      username: "testuser",
      tokenType: "access" as const,
      isAdmin: true,
    } as any);
  });

  it("GET /v1/api/notifications/recent returns recent notifications", async () => {
    const mockNotifications = {
      results: [
        {
          id: "notif-123",
          alert_id: "alert-456",
          symbol: "AAPL",
          threshold: 200,
          price: 205,
          direction: "above",
          push_token: "fcm-token-123",
          status: "success",
          error_message: null,
          attempt_count: 1,
          sent_at: "2025-01-01T00:00:00Z",
          username: "testuser",
        },
      ],
    };

    const env = createEnv();
    // Override the default prepare - the code calls .all() directly on prepare() result
    env.stockly.prepare = vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue(mockNotifications),
      bind: vi.fn().mockReturnThis(),
    });

    const request = new Request("https://example.com/v1/api/notifications/recent");
    const response = await getRecentNotifications(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.notifications).toBeDefined();
    expect(Array.isArray(data.notifications)).toBe(true);
  });

  it("GET /v1/api/notifications/failed returns failed notifications", async () => {
    const mockNotifications = {
      results: [
        {
          id: "notif-123",
          alert_id: "alert-456",
          symbol: "AAPL",
          threshold: 200,
          price: 205,
          direction: "above",
          push_token: "fcm-token-123",
          status: "failed",
          error_message: "Invalid token",
          attempt_count: 1,
          sent_at: "2025-01-01T00:00:00Z",
          username: "testuser",
        },
      ],
    };

    const env = createEnv();
    // Override the default prepare - the code calls .all() directly on prepare() result
    env.stockly.prepare = vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue(mockNotifications),
      bind: vi.fn().mockReturnThis(),
    });

    const request = new Request("https://example.com/v1/api/notifications/failed");
    const response = await getFailedNotifications(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.notifications).toBeDefined();
    expect(Array.isArray(data.notifications)).toBe(true);
  });

  it("POST /v1/api/notifications/retry/:logId retries a failed notification", async () => {
    const mockLog = {
      id: "notif-123",
      alert_id: "alert-456",
      symbol: "AAPL",
      threshold: 200,
      price: 205,
      direction: "above",
      push_token: "fcm-token-12345678901234567890",
      status: "failed",
      error_message: "Invalid token",
      attempt_count: 1,
      sent_at: "2025-01-01T00:00:00Z",
    };

    const env = createEnv();
    env.FCM_SERVICE_ACCOUNT = JSON.stringify({
      type: "service_account",
      project_id: "test-project",
      private_key_id: "test-key-id",
      private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
      client_email: "test@test-project.iam.gserviceaccount.com",
      client_id: "123456789",
    });
    
    const first = vi.fn().mockResolvedValue(mockLog);
    const all = vi.fn().mockResolvedValue({ results: [] });
    const run = vi.fn().mockResolvedValue(undefined);
    const bind = vi.fn().mockReturnValue({ first, all, run });
    env.stockly.prepare = vi.fn().mockReturnValue({ bind });

    // Mock FCM and Google Auth
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: "projects/test/messages/0:123" }),
      } as Response);
    
    global.crypto = {
      subtle: {
        importKey: vi.fn().mockResolvedValue({}),
        sign: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      } as unknown as SubtleCrypto,
      getRandomValues: vi.fn(),
    } as Crypto;

    const request = new Request("https://example.com/v1/api/notifications/retry/notif-123");
    const response = await retryNotification(request, "notif-123", env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("success");
  });
});

// ============================================================================
// DEVICES TESTS
// ============================================================================

describe("API - Devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequestWithAdmin).mockResolvedValue({
      username: "testuser",
      tokenType: "access" as const,
      isAdmin: true,
    } as any);
  });

  it("GET /v1/api/devices returns all devices", async () => {
    // Mock devices query (new schema)
    const mockDeviceRows = [
      {
        device_id: 1,
        user_id: "user-123",
        device_info: "iPhone 14 Pro",
        device_type: "ios",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        username: "testuser",
      },
    ];

    const env = createEnv();
    
    // Mock prepare to return different statements based on query
    const alertCountStmt = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ count: 0 }),
    };

    // Mock push tokens query
    const pushTokensStmt = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [{ push_token: "fcm-token-123" }] }),
    };
    
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
      if (query.includes("FROM devices d") && query.includes("LEFT JOIN users")) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: mockDeviceRows }),
        };
      } else if (query.includes("SELECT push_token") && query.includes("FROM device_push_tokens") && query.includes("device_id")) {
        return pushTokensStmt;
      } else if (query.includes("COUNT(*)") && query.includes("FROM alerts") && query.includes("status = 'active'")) {
        return alertCountStmt;
      } else if (query.includes("COUNT(*)") && query.includes("FROM alerts")) {
        return alertCountStmt;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: 0 }),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });

    const request = new Request("https://example.com/v1/api/devices");
    const response = await getAllDevices(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.devices).toBeDefined();
    expect(Array.isArray(data.devices)).toBe(true);
  });

  it("DELETE /v1/api/devices deletes a device", async () => {
    const env = createEnv();
    let queryCount = 0;
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
      queryCount++;
      if (query.includes("SELECT dpt.device_id") && query.includes("FROM device_push_tokens")) {
        // First query: check if token exists (new schema)
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ device_id: 1, user_id: "user-123", username: "testuser" }),
          }),
        };
      } else if (query.includes("SELECT id FROM users WHERE username")) {
        // Second query: get user for auth check
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ id: "user-123" }),
          }),
        };
      } else if (query.includes("DELETE FROM device_push_tokens")) {
        // Third query: delete push token
        return {
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue(undefined),
          }),
        };
      } else if (query.includes("SELECT COUNT(*)") && query.includes("FROM device_push_tokens")) {
        // Fourth query: check remaining tokens
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ count: 0 }),
          }),
        };
      } else if (query.includes("UPDATE devices SET is_active")) {
        // Fifth query: deactivate device
        return {
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue(undefined),
          }),
        };
      }
      // Default fallback
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue(undefined),
        }),
      };
    });

    const request = new Request("https://example.com/v1/api/devices?pushToken=fcm-token-12345678901234567890", { method: "DELETE" });
    const response = await deleteDevice(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});

// ============================================================================
// ADMIN CONFIG TESTS
// ============================================================================

describe("API - Admin Config", () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it("GET /config/get returns admin configuration", async () => {
    const env = createEnv();
    const response = await getConfigEndpoint(env);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.featureFlags).toBeDefined();
  });

  it("POST /config/update updates admin configuration", async () => {
    const payload = {
      featureFlags: {
        simulateProviderFailure: true,
      },
    };

    const request = new Request("https://example.com/config/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const env = createEnv();
    const response = await updateConfigEndpoint(request, env);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.featureFlags.simulateProviderFailure).toBe(true);
  });

  it("POST /v1/api/simulate-provider-failure enables simulation mode", async () => {
    const env = createEnv();
    const response = await simulateProviderFailureEndpoint(env);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.featureFlags.simulateProviderFailure).toBe(true);
  });

  it("POST /v1/api/disable-provider-failure disables simulation mode", async () => {
    const env = createEnv();
    const response = await disableProviderFailureEndpoint(env);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.featureFlags.simulateProviderFailure).toBe(false);
  });
});

// ============================================================================
// OPENAPI TESTS
// ============================================================================

describe("API - OpenAPI", () => {
  it("GET /openapi.json returns OpenAPI specification", async () => {
    const response = await getOpenApiSpec();
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.openapi).toBe("3.0.0");
    expect(data.info.title).toBe("Stockly API");
    expect(data.paths).toBeDefined();
    expect(data.paths["/v1/api/health"]).toBeDefined();
    expect(data.paths["/v1/api/get-stock"]).toBeDefined();
    expect(data.paths["/v1/api/get-stocks"]).toBeDefined();
    expect(data.paths["/v1/api/get-stock-details"]).toBeDefined();
    // Note: /v1/api/get-stock-news exists but is not yet documented in OpenAPI spec
  });
});

