/**
 * COMPREHENSIVE API TESTS
 * 
 * Tests for ALL endpoints documented in API_DOCUMENTATION.md
 * Ensures all endpoints work as expected per the documentation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { healthCheck } from "../src/api/health";
import { getStock } from "../src/api/get-stock";
import { getStocks } from "../src/api/get-stocks";
import { getStockDetailsRoute } from "../src/api/get-stock-details";
import { getStockNews } from "../src/api/get-stock-news";
import { searchStock } from "../src/api/search-stock";
import { getHistorical } from "../src/api/get-historical";
import { handleAlertsRequest } from "../src/api/alerts";
import { registerPushToken, getPushToken } from "../src/api/push-token";
import { getPreferences, updatePreferences } from "../src/api/preferences";
import { getSettings, updateSettings } from "../src/api/settings";
import { getRecentNotifications, getFailedNotifications, retryNotification } from "../src/api/admin";
import { getAllDevices, sendTestNotification, deleteDevice } from "../src/api/devices";
import { getConfigEndpoint, updateConfigEndpoint, simulateProviderFailureEndpoint, disableProviderFailureEndpoint } from "../src/api/config";
import { getOpenApiSpec } from "../src/api/openapi";
import { clearCache } from "../src/api/cache";
import { clearConfigCache } from "../src/api/config";
import * as alertsStorage from "../src/alerts/storage";
import type { Env } from "../src/index";
import { createMockLogger } from "./test-utils";

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
  const run = vi.fn().mockResolvedValue(undefined);
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

    vi.spyOn(globalThis as any, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockQuote],
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

    const env = createEnv();
    const url = createUrl("/v1/api/get-stock", { symbol: "AAPL" });
    const request = createRequest("/v1/api/get-stock", { symbol: "AAPL" });
    const response = await getStock(request, url, env, undefined, createMockLogger());
    
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
    const url = createUrl("/v1/api/get-stock");
    const request = createRequest("/v1/api/get-stock");
    const response = await getStock(request, url, env, undefined, createMockLogger());
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("symbol");
  });
});

describe("API - Get Multiple Stocks", () => {
  beforeEach(() => {
    clearCache();
    clearConfigCache();
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

    let callCount = 0;
    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      if (url.includes("/quote?")) {
        const symbol = url.match(/symbol=([^&]+)/)?.[1];
        const quote = mockQuotes.find(q => q.symbol === symbol);
        callCount++;
        return Promise.resolve({
          ok: true,
          json: async () => quote ? [quote] : [],
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });

    const env = createEnv();
    const url = createUrl("/v1/api/get-stocks", { symbols: "AAPL,MSFT" });
    const request = createRequest("/v1/api/get-stocks", { symbols: "AAPL,MSFT" });
    const response = await getStocks(request, url, env, createMockLogger());
    
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
    const url = createUrl("/v1/api/get-stocks");
    const request = createRequest("/v1/api/get-stocks");
    const response = await getStocks(request, url, env, createMockLogger());
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("symbols");
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
    const url = createUrl("/v1/api/search-stock", { query: "AP" });
    const request = createRequest("/v1/api/search-stock", { query: "AP" });
    const response = await searchStock(request, url, env, createMockLogger());
    
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
    const url = createUrl("/v1/api/search-stock");
    const request = createRequest("/v1/api/search-stock");
    const response = await searchStock(request, url, env, createMockLogger());
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

    const url = createUrl("/v1/api/get-historical", { symbol: "AAPL", days: "180" });
    const request = createRequest("/v1/api/get-historical", { symbol: "AAPL", days: "180" });
    const response = await getHistorical(request, url, env, undefined, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.symbol).toBe("AAPL");
    expect(data.days).toBe(180);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("GET /v1/api/get-historical returns 400 when symbol is missing", async () => {
    const env = createEnv();
    const url = createUrl("/v1/api/get-historical");
    const request = createRequest("/v1/api/get-historical");
    const response = await getHistorical(request, url, env, undefined, createMockLogger());
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
        id: "alert-123",
        symbol: "AAPL",
        direction: "above" as const,
        threshold: 200,
        status: "active" as const,
        channel: "notification" as const,
        target: "fcm-token-123",
        username: "testuser",
        notes: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    ];

    vi.mocked(alertsStorage.listAlerts).mockResolvedValue(mockAlerts);

    const request = new Request("https://example.com/v1/api/alerts", { method: "GET" });
    const env = createEnv();
    const response = await handleAlertsRequest(request, env, createMockLogger());
    
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
      target: "fcm-token-123",
    };

    const createdAlert = {
      id: "alert-123",
      ...createRequest,
      status: "active" as const,
      username: "testuser",
      notes: null,
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
    const response = await handleAlertsRequest(request, env, createMockLogger());
    
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.symbol).toBe("AAPL");
    expect(data.threshold).toBe(200);
  });

  it("GET /v1/api/alerts/:id gets a specific alert", async () => {
    const mockAlert = {
      id: "alert-123",
      symbol: "AAPL",
      direction: "above" as const,
      threshold: 200,
      status: "active" as const,
      channel: "notification" as const,
      target: "fcm-token-123",
      username: "testuser",
      notes: null,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };

    vi.mocked(alertsStorage.getAlert).mockResolvedValue(mockAlert);

    const request = new Request("https://example.com/v1/api/alerts/alert-123", { method: "GET" });
    const env = createEnv();
    const response = await handleAlertsRequest(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe("alert-123");
  });

  it("PUT /v1/api/alerts/:id updates an alert", async () => {
    const updateRequest = { status: "paused" as const };

    const updatedAlert = {
      id: "alert-123",
      symbol: "AAPL",
      direction: "above" as const,
      threshold: 200,
      status: "paused" as const,
      channel: "notification" as const,
      target: "fcm-token-123",
      username: "testuser",
      notes: null,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
    };

    vi.mocked(alertsStorage.updateAlert).mockResolvedValue(updatedAlert);

    const request = new Request("https://example.com/v1/api/alerts/alert-123", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateRequest),
    });
    const env = createEnv();
    const response = await handleAlertsRequest(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("paused");
  });

  it("DELETE /v1/api/alerts/:id deletes an alert", async () => {
    vi.mocked(alertsStorage.deleteAlert).mockResolvedValue(true);

    const request = new Request("https://example.com/v1/api/alerts/alert-123", {
      method: "DELETE",
    });
    const env = createEnv();
    const response = await handleAlertsRequest(request, env, createMockLogger());
    
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
            ? null // No existing token
            : { push_token: "fcm-token-12345678901234567890", device_info: "iPhone 14 Pro", device_type: "ios", user_id: "user-123", username: "testuser" }; // Verification query
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
            ? { id: 1, user_id: "user-123" } // Existing token
            : { push_token: "fcm-token-12345678901234567890", device_info: "iPhone 15 Pro", device_type: "ios", user_id: "user-123", username: "testuser" }; // Verification query
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
    const mockTokens = [
      {
      push_token: "fcm-token-12345678901234567890",
      device_info: "iPhone 14 Pro",
        device_type: "ios",
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
        all: vi.fn().mockResolvedValue({ results: mockTokens }), // Push tokens
      });
      return { bind };
    });

    const request = new Request("https://example.com/v1/api/push-token");
    const response = await getPushToken(request, env, createMockLogger());
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.username).toBe("testuser");
    expect(Array.isArray(data.devices)).toBe(true);
    expect(data.devices[0].pushToken).toBe("fcm-token-12345678901234567890");
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
    const mockDevices = [
      {
        user_id: "user-123",
        push_token: "fcm-token-123",
        device_info: "iPhone 14 Pro",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      },
    ];

    const env = createEnv();
    
    // Mock prepare to return different statements based on query
    const alertCountStmt = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ count: 0 }),
    };
    
    env.stockly.prepare = vi.fn().mockImplementation((query: string) => {
      if (query.includes("user_push_tokens")) {
        return {
          all: vi.fn().mockResolvedValue({ results: mockDevices }),
        };
      } else if (query.includes("alerts") && query.includes("COUNT")) {
        return alertCountStmt;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: 0 }),
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
      if (query.includes("user_push_tokens") && query.includes("push_token = ?") && query.includes("SELECT")) {
        // First query: check if device exists
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ user_id: "user-123", push_token: "fcm-token-12345678901234567890" }),
          }),
        };
      } else if (query.includes("users") && query.includes("username")) {
        // Second query: get device user
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ username: "testuser" }),
          }),
        };
      } else if (query.includes("DELETE")) {
        // Third query: delete device
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

