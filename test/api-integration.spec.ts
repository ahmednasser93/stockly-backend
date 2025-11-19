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
import { getStock } from "../src/api/get-stock";
import { getStocks } from "../src/api/get-stocks";
import { searchStock } from "../src/api/search-stock";
import { getHistorical } from "../src/api/get-historical";
import { handleAlertsRequest } from "../src/api/alerts";
import { healthCheck } from "../src/api/health";
import * as alertsStorage from "../src/alerts/storage";

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

const createEnv = (): Env => {
  const run = vi.fn().mockResolvedValue(undefined);
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

    vi.spyOn(globalThis as any, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockQuote],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ ...mockQuote, description: mockQuote.description }],
      } as Response);

    const env = createEnv();
    const response = await getStock(createUrl("/v1/api/get-stock", { symbol: "AAPL" }), env);
    
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
    const response = await getStock(createUrl("/v1/api/get-stock"), env);
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
    expect(data.error).toContain("symbol");
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
    const response = await getStock(createUrl("/v1/api/get-stock", { symbol: "MSFT" }), env);
    
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

    // Mock fetch - need to handle multiple quote calls (one per symbol) and profile calls
    let quoteCallCount = 0;
    vi.spyOn(globalThis as any, "fetch")
      .mockImplementation((url: string) => {
        if (url.includes("/quote?")) {
          // Each symbol gets its own quote call - return the appropriate quote
          const symbol = url.match(/symbol=([^&]+)/)?.[1];
          const quote = mockQuotes.find(q => q.symbol === symbol);
          quoteCallCount++;
          return Promise.resolve({
            ok: true,
            json: async () => quote ? [quote] : [],
          } as Response);
        }
        // Profile endpoint or Wikipedia - return empty or minimal data
        if (url.includes("wikipedia.org")) {
          return Promise.resolve({
            ok: false,
          } as Response);
        }
        // Profile endpoint - return empty array (profile fetching will skip)
        return Promise.resolve({
          ok: true,
          json: async () => [],
        } as Response);
      });

    const env = createEnv();
    const response = await getStocks(createUrl("/v1/api/get-stocks", { symbols: "AAPL,MSFT" }), env);
    
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
    const response = await getStocks(createUrl("/v1/api/get-stocks"), env);
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
  });

  it("handles empty symbols list", async () => {
    const env = createEnv();
    const response = await getStocks(createUrl("/v1/api/get-stocks", { symbols: "" }), env);
    
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
    const response = await searchStock(createUrl("/v1/api/search-stock", { query: "AP" }), env);
    
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
    const response = await searchStock(createUrl("/v1/api/search-stock"), env);
    
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
    const bind = vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue(mockHistoricalData),
    });
    env.stockly.prepare = vi.fn().mockReturnValue({ bind });

    const response = await getHistorical(createUrl("/v1/api/get-historical", { symbol: "AAPL", days: "180" }), env);
    
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
    const response = await getHistorical(createUrl("/v1/api/get-historical"), env);
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
  });

  it("validates days parameter", async () => {
    const env = createEnv();
    const response = await getHistorical(createUrl("/v1/api/get-historical", { symbol: "AAPL", days: "0" }), env);
    
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
        target: "test@example.com",
        notes: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    ];

    vi.mocked(alertsStorage.listAlerts).mockResolvedValue(mockAlerts);

    const request = new Request("https://example.com/v1/api/alerts", { method: "GET" });
    const env = createEnv();
    const response = await handleAlertsRequest(request, env);
    
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
      target: "test@example.com",
      notes: null,
    };

    const createdAlert = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      ...createRequest,
      status: "active" as const,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };

    vi.mocked(alertsStorage.createAlert).mockResolvedValue(createdAlert);

    const request = new Request("https://example.com/v1/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRequest),
    });
    const env = createEnv();
    const response = await handleAlertsRequest(request, env);
    
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(validateAlert(data)).toBe(true);
    expect(data.symbol).toBe("AAPL");
    expect(data.threshold).toBe(200);
  });

  it("successfully updates an alert", async () => {
    const updateRequest = {
      status: "paused" as const,
    };

    const updatedAlert = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      symbol: "AAPL",
      direction: "above" as const,
      threshold: 200,
      status: "paused" as const,
      channel: "notification" as const,
      target: "test@example.com",
      notes: null,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
    };

    vi.mocked(alertsStorage.updateAlert).mockResolvedValue(updatedAlert);

    const request = new Request("https://example.com/v1/api/alerts/123e4567-e89b-12d3-a456-426614174000", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateRequest),
    });
    const env = createEnv();
    const response = await handleAlertsRequest(request, env);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(validateAlert(data)).toBe(true);
    expect(data.status).toBe("paused");
  });

  it("successfully deletes an alert", async () => {
    vi.mocked(alertsStorage.deleteAlert).mockResolvedValue(true);

    const request = new Request("https://example.com/v1/api/alerts/123e4567-e89b-12d3-a456-426614174000", {
      method: "DELETE",
    });
    const env = createEnv();
    const response = await handleAlertsRequest(request, env);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("success", true);
  });

  it("returns 404 when alert not found", async () => {
    vi.mocked(alertsStorage.getAlert).mockResolvedValue(null);

    const request = new Request("https://example.com/v1/api/alerts/non-existent", { method: "GET" });
    const env = createEnv();
    const response = await handleAlertsRequest(request, env);
    
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(validateErrorResponse(data)).toBe(true);
  });
});

