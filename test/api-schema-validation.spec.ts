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
import { getStock } from "../src/api/get-stock";
import { getStocks } from "../src/api/get-stocks";
import { searchStock } from "../src/api/search-stock";
import { getHistorical } from "../src/api/get-historical";
import { handleAlertsRequest } from "../src/api/alerts";
import { healthCheck } from "../src/api/health";
import * as alertsStorage from "../src/alerts/storage";
import * as alertsState from "../src/alerts/state";

vi.mock("../src/alerts/storage", () => ({
  listAlerts: vi.fn(),
  createAlert: vi.fn(),
  getAlert: vi.fn(),
  updateAlert: vi.fn(),
  deleteAlert: vi.fn(),
}));

vi.mock("../src/alerts/state", () => ({
  deleteAlertState: vi.fn(),
}));
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

const createEnv = (): Env => {
  const run = vi.fn().mockResolvedValue(undefined);
  const bind = vi.fn().mockReturnValue({ run, first: vi.fn().mockResolvedValue(null) });
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

    vi.spyOn(globalThis as any, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [quote],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ ...quote, description: quote.description }],
      } as Response);

    const env = createEnv();
    const response = await getStock(createUrl("/v1/api/get-stock", { symbol: "AAPL" }), env, undefined, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateStockQuoteResponse(data)).toBe(true);
    expect(data).toHaveProperty("symbol", "AAPL");
    expect(data).toHaveProperty("price");
    expect(typeof data.price).toBe("number");
  });

  it("getStock returns valid ErrorResponse schema on error", async () => {
    const env = createEnv();
    const response = await getStock(createUrl("/v1/api/get-stock"), env, undefined, createMockLogger());
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
    expect(data).toHaveProperty("error");
    expect(typeof data.error).toBe("string");
  });
});

// ============================================================================
// GET STOCKS SCHEMA TESTS
// ============================================================================

describe("API Schema Validation - Get Stocks", () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
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
    const response = await getStocks(createUrl("/v1/api/get-stocks", { symbols: "AAPL,MSFT" }), env, createMockLogger());
    
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
    const response = await getStocks(createUrl("/v1/api/get-stocks"), env, createMockLogger());
    
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
    const response = await searchStock(createUrl("/v1/api/search-stock", { query: "AP" }), env, createMockLogger());
    
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

    const response = await getHistorical(createUrl("/v1/api/get-historical", { symbol: "AAPL", days: "180" }), env, undefined, createMockLogger());
    
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
    const response = await getHistorical(createUrl("/v1/api/get-historical"), env, undefined, createMockLogger());
    
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
  });

  it("listAlerts returns valid AlertsListResponse schema", async () => {
    const alerts: Alert[] = [
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        symbol: "AAPL",
        direction: "above",
        threshold: 200,
        status: "active",
        channel: "email",
        target: "test@example.com",
        notes: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    ];

    vi.mocked(alertsStorage.listAlerts).mockResolvedValue(alerts);

    const request = new Request("https://example.com/v1/api/alerts", { method: "GET" });
    const env = createEnv();
    const response = await handleAlertsRequest(request, env, createMockLogger());
    
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
    const createRequest: CreateAlertRequest = {
      symbol: "AAPL",
      direction: "above",
      threshold: 200,
      channel: "notification",
      target: "test@example.com",
      notes: null,
    };

    expect(validateCreateAlertRequest(createRequest)).toBe(true);

    const created: Alert = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      symbol: createRequest.symbol,
      direction: createRequest.direction,
      threshold: createRequest.threshold,
      channel: createRequest.channel,
      target: createRequest.target,
      notes: createRequest.notes ?? null,
      status: "active",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };

    vi.mocked(alertsStorage.createAlert).mockResolvedValue(created);

    const request = new Request("https://example.com/v1/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRequest),
    });
    const env = createEnv();
    const response = await handleAlertsRequest(request, env, createMockLogger());
    
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(validateAlert(data)).toBe(true);
  });

  it("updateAlert accepts valid UpdateAlertRequest schema", async () => {
    const updateRequest: UpdateAlertRequest = {
      status: "paused",
    };

    expect(validateUpdateAlertRequest(updateRequest)).toBe(true);

    const updated: Alert = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      symbol: "AAPL",
      direction: "above",
      threshold: 200,
      status: "paused",
      channel: "email",
      target: "test@example.com",
      notes: null,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
    };

    vi.mocked(alertsStorage.updateAlert).mockResolvedValue(updated);

    const request = new Request("https://example.com/v1/api/alerts/123", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateRequest),
    });
    const env = createEnv();
    const response = await handleAlertsRequest(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateAlert(data)).toBe(true);
  });

  it("getAlert returns valid Alert schema", async () => {
    const alert: Alert = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      symbol: "AAPL",
      direction: "above",
      threshold: 200,
      status: "active",
      channel: "email",
      target: "test@example.com",
      notes: null,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };

    vi.mocked(alertsStorage.getAlert).mockResolvedValue(alert);

    const request = new Request("https://example.com/v1/api/alerts/123", { method: "GET" });
    const env = createEnv();
    const response = await handleAlertsRequest(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateAlert(data)).toBe(true);
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

