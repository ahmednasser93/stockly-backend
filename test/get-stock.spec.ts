import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getStock } from "../src/api/get-stock";
import { API_KEY, API_URL } from "../src/util";
import { clearCache, setCache, getCache } from "../src/api/cache";
import { clearConfigCache } from "../src/api/config";
import type { Env } from "../src/index";
import { createMockLogger } from "./test-utils";

// Mock FCM notification module
vi.mock("../src/notifications/fcm-sender", () => ({
  sendFCMNotification: vi.fn().mockResolvedValue(true),
}));

const createUrl = (params: Record<string, string> = {}) => {
  const url = new URL("https://example.com/v1/api/get-stock");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
};

const createRequest = (params: Record<string, string> = {}) => {
  const url = createUrl(params);
  return new Request(url.toString());
};

const createEnv = (): Env => {
  const run = vi.fn().mockResolvedValue(undefined);
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return {
    stockly: { prepare } as any,
  };
};

describe("getStock handler", () => {
  beforeEach(() => {
    clearCache();
    clearConfigCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearConfigCache();
  });

  it("requires a symbol", async () => {
    const url = createUrl();
    const request = createRequest();
    const response = await getStock(request, url, createEnv(), undefined, createMockLogger());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "symbol required" });
  });

  it("returns cached data without calling the upstream API", async () => {
    const cached = { symbol: "MSFT", price: 100 };
    setCache("quote:MSFT", cached, 30);
    const fetchSpy = vi.spyOn(globalThis as any, "fetch");

    const url = createUrl({ symbol: "msft" });
    const request = createRequest({ symbol: "msft" });
    const response = await getStock(request, url, createEnv(), undefined, createMockLogger());

    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual(cached);
  });

  it("fetches the quote and caches the parsed response", async () => {
    const env = createEnv();
    // Set up default config in KV
    const kvMap = new Map<string, string>();
    kvMap.set(
      "admin:config",
      JSON.stringify({
        pollingIntervalSec: 30,
        featureFlags: { simulateProviderFailure: false },
      })
    );
    env.alertsKv = {
      get: vi.fn((key: string) => Promise.resolve(kvMap.get(key) ?? null)),
      put: vi.fn(() => Promise.resolve()),
    } as any;

    const quote = { symbol: "AAPL", price: 195 };
    const quoteJson = vi.fn().mockResolvedValue([quote]);
    const profileJson = vi.fn().mockResolvedValue([]);
    const fetchMock = vi
      .spyOn(globalThis as any, "fetch")
      .mockImplementation((url: string) => {
        if (url.includes("/quote?")) {
          return Promise.resolve({ ok: true, json: quoteJson } as Response);
        }
        // Profile endpoints
        return Promise.resolve({ ok: true, json: profileJson } as Response);
      });

    const bind = vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue(undefined) });
    const prepare = vi.fn().mockReturnValue({ bind });
    env.stockly = { prepare } as any;

    const url = createUrl({ symbol: "AAPL" });
    const request = createRequest({ symbol: "AAPL" });
    const response = await getStock(request, url, env, undefined, createMockLogger());

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/quote?symbol=AAPL&apikey=${API_KEY}`,
    );
    const data = await response.json();
    // Profile fetching adds extra fields, so just check the core fields
    expect(data.symbol).toBe("AAPL");
    expect(data.price).toBe(195);
    expect(getCache("quote:AAPL")).toBeTruthy();
  });

  it("returns an error when the upstream API fails", async () => {
    const env = createEnv();
    // Set up default config in KV
    const kvMap = new Map<string, string>();
    kvMap.set(
      "admin:config",
      JSON.stringify({
        pollingIntervalSec: 30,
        featureFlags: { simulateProviderFailure: false },
      })
    );
    env.alertsKv = {
      get: vi.fn((key: string) => Promise.resolve(kvMap.get(key) ?? null)),
      put: vi.fn(() => Promise.resolve()),
    } as any;

    // Mock DB to return null (no fallback data)
    const bind = vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) });
    const prepare = vi.fn().mockReturnValue({ bind });
    env.stockly = { prepare } as any;

    vi.spyOn(globalThis as any, "fetch").mockRejectedValue(new Error("fail"));

    const url = createUrl({ symbol: "TSLA" });
    const request = createRequest({ symbol: "TSLA" });
    const response = await getStock(request, url, env, undefined, createMockLogger());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "no_price_available",
    });
  });

  it("returns stale data from DB when simulation mode is enabled", async () => {
    const env = createEnv();
    // Clear config cache to ensure fresh read
    clearConfigCache();
    const kvMap = new Map<string, string>();
    kvMap.set(
      "admin:config",
      JSON.stringify({
        pollingIntervalSec: 30,
        featureFlags: { simulateProviderFailure: true },
      })
    );
    env.alertsKv = {
      get: vi.fn((key: string) => Promise.resolve(kvMap.get(key) ?? null)),
      put: vi.fn(() => Promise.resolve()),
    } as any;

    const dbRecord = {
      symbol: "AAPL",
      price: 150.5,
      day_low: 149.0,
      day_high: 151.0,
      volume: 1000000,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const bind = vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(dbRecord) });
    const prepare = vi.fn().mockReturnValue({ bind });
    env.stockly = { prepare } as any;

    const fetchSpy = vi.spyOn(globalThis as any, "fetch");

    const url = createUrl({ symbol: "AAPL" });
    const request = createRequest({ symbol: "AAPL" });
    const response = await getStock(request, url, env, undefined, createMockLogger());
    const data = await response.json();

    expect(fetchSpy).not.toHaveBeenCalled(); // Should not call provider
    expect(data.simulationActive).toBe(true);
    expect(data.stale).toBe(true);
    expect(data.stale_reason).toBe("simulation_mode");
    expect(data.price).toBe(150.5);
    expect(data.symbol).toBe("AAPL");
    expect(data.lastUpdatedAt).toBeDefined();
  });

  it("returns no_price_available when simulation is enabled but no DB data exists", async () => {
    const env = createEnv();
    const kvMap = new Map<string, string>();
    kvMap.set(
      "admin:config",
      JSON.stringify({
        featureFlags: { simulateProviderFailure: true },
      })
    );
    env.alertsKv = {
      get: vi.fn((key: string) => Promise.resolve(kvMap.get(key) ?? null)),
    } as any;

    const bind = vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) });
    const prepare = vi.fn().mockReturnValue({ bind });
    env.stockly = { prepare } as any;

    const url = createUrl({ symbol: "AAPL" });
    const request = createRequest({ symbol: "AAPL" });
    const response = await getStock(request, url, env, undefined, createMockLogger());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "no_price_available",
    });
  });

  it("calls provider normally when simulation is disabled", async () => {
    const env = createEnv();
    // Clear config cache to ensure fresh read
    clearConfigCache();
    const kvMap = new Map<string, string>();
    kvMap.set(
      "admin:config",
      JSON.stringify({
        pollingIntervalSec: 30,
        featureFlags: { simulateProviderFailure: false },
      })
    );
    env.alertsKv = {
      get: vi.fn((key: string) => Promise.resolve(kvMap.get(key) ?? null)),
      put: vi.fn(() => Promise.resolve()),
    } as any;

    const quote = { symbol: "AAPL", price: 195 };
    const quoteJson = vi.fn().mockResolvedValue([quote]);
    const profileJson = vi.fn().mockResolvedValue([]);
    const fetchMock = vi
      .spyOn(globalThis as any, "fetch")
      .mockImplementation((url: string) => {
        if (url.includes("/quote?")) {
          return Promise.resolve({ ok: true, json: quoteJson } as Response);
        }
        // Profile endpoints
        return Promise.resolve({ ok: true, json: profileJson } as Response);
      });

    const bind = vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue(undefined) });
    const prepare = vi.fn().mockReturnValue({ bind });
    env.stockly = { prepare } as any;

    const url = createUrl({ symbol: "AAPL" });
    const request = createRequest({ symbol: "AAPL" });
    const response = await getStock(request, url, env, undefined, createMockLogger());

    expect(fetchMock).toHaveBeenCalled();
    const data = await response.json();
    // Profile fetching adds extra fields, so just check the core fields
    expect(data.symbol).toBe("AAPL");
    expect(data.price).toBe(195);
  });

  it("falls back to DB and returns stale data when provider API fails", async () => {
    const env = createEnv();
    // Clear config cache to ensure fresh read
    clearConfigCache();
    const kvMap = new Map<string, string>();
    kvMap.set(
      "admin:config",
      JSON.stringify({
        pollingIntervalSec: 30,
        featureFlags: { simulateProviderFailure: false },
      })
    );

    // Mock KV for config and notification throttling
    let notificationThrottleCalled = false;
    env.alertsKv = {
      get: vi.fn((key: string) => {
        if (key === "admin:config") {
          return Promise.resolve(kvMap.get(key) ?? null);
        }
        // Notification throttle key - return null (first time, not throttled)
        if (key.includes("provider_failure")) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      }),
      put: vi.fn(() => {
        notificationThrottleCalled = true;
        return Promise.resolve();
      }),
    } as any;

    const dbRecord = {
      symbol: "AAPL",
      price: 150.5,
      day_low: 149.0,
      day_high: 151.0,
      volume: 1000000,
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Mock DB queries - one for fallback data, one for user tokens
    let queryCount = 0;
    const bindDb = vi.fn().mockImplementation((symbol: string) => {
      queryCount++;
      if (queryCount === 1) {
        // First query: get cached price
        return { first: vi.fn().mockResolvedValue(dbRecord) };
      } else if (queryCount === 2) {
        // Second query: get user tokens (for notifications)
        return {
          all: vi.fn().mockResolvedValue({
            results: [
              { user_id: "user1", push_token: "test-token-123" },
            ],
          }),
        };
      }
      return { first: vi.fn().mockResolvedValue(null) };
    });

    const prepare = vi.fn().mockReturnValue({ bind: bindDb });
    env.stockly = { prepare } as any;

    // Mock provider API failure
    const fetchSpy = vi.spyOn(globalThis as any, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    });

    // FCM notification is already mocked at the top of the file

    // Mock ctx.waitUntil for notifications
    const waitUntilSpy = vi.fn();
    const ctx = { waitUntil: waitUntilSpy } as ExecutionContext;

    const url = createUrl({ symbol: "AAPL" });
    const request = createRequest({ symbol: "AAPL" });
    const response = await getStock(request, url, env, ctx, createMockLogger());
    const data = await response.json();

    expect(fetchSpy).toHaveBeenCalled(); // Provider was called
    expect(data.stale).toBe(true);
    expect(data.stale_reason).toBe("provider_api_error");
    expect(data.price).toBe(150.5);
    expect(data.symbol).toBe("AAPL");
    expect(data.lastUpdatedAt).toBeDefined();
    // Verify notifications were scheduled (non-blocking)
    expect(waitUntilSpy).toHaveBeenCalled();
  });

  it("falls back to DB when provider returns invalid data", async () => {
    const env = createEnv();
    const kvMap = new Map<string, string>();
    kvMap.set(
      "admin:config",
      JSON.stringify({
        featureFlags: { simulateProviderFailure: false },
      })
    );

    let queryCount = 0;
    env.alertsKv = {
      get: vi.fn((key: string) => {
        if (key === "admin:config") {
          return Promise.resolve(kvMap.get(key) ?? null);
        }
        return Promise.resolve(null); // No throttle
      }),
      put: vi.fn(() => Promise.resolve()),
    } as any;

    const dbRecord = {
      symbol: "TSLA",
      price: 250.0,
      day_low: 248.0,
      day_high: 252.0,
      volume: 5000000,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const bindDb = vi.fn().mockImplementation((arg: any) => {
      queryCount++;
      if (queryCount === 1) {
        // First call: get DB record (has symbol argument)
        return { first: vi.fn().mockResolvedValue(dbRecord) };
      } else if (queryCount === 2) {
        // Second call: get push tokens (no symbol, uses .all())
        return {
          all: vi.fn().mockResolvedValue({
            results: [],
          }),
        };
      }
      return { first: vi.fn().mockResolvedValue(null) };
    });
    const prepare = vi.fn().mockReturnValue({ bind: bindDb });
    env.stockly = { prepare } as any;

    // Mock provider returning error message
    const json = vi.fn().mockResolvedValue({ "Error Message": "Invalid symbol" });
    const fetchSpy = vi.spyOn(globalThis as any, "fetch").mockResolvedValue({
      ok: true,
      json,
    });

    const waitUntilSpy = vi.fn();
    const ctx = { waitUntil: waitUntilSpy } as ExecutionContext;

    const url = createUrl({ symbol: "TSLA" });
    const request = createRequest({ symbol: "TSLA" });
    const response = await getStock(request, url, env, ctx, createMockLogger());
    const data = await response.json();

    expect(data.stale).toBe(true);
    expect(data.stale_reason).toBe("provider_invalid_data");
    expect(data.price).toBe(250.0);
    expect(waitUntilSpy).toHaveBeenCalled(); // Notifications scheduled
  });

  it("falls back to DB when provider network request fails", async () => {
    const env = createEnv();
    const kvMap = new Map<string, string>();
    kvMap.set(
      "admin:config",
      JSON.stringify({
        pollingIntervalSec: 30,
        featureFlags: { simulateProviderFailure: false },
      })
    );

    let queryCount = 0;
    env.alertsKv = {
      get: vi.fn((key: string) => {
        if (key === "admin:config") {
          return Promise.resolve(kvMap.get(key) ?? null);
        }
        return Promise.resolve(null);
      }),
      put: vi.fn(() => Promise.resolve()),
    } as any;

    const dbRecord = {
      symbol: "MSFT",
      price: 380.0,
      day_low: 375.0,
      day_high: 385.0,
      volume: 2000000,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const bindDb = vi.fn().mockImplementation((arg: any) => {
      queryCount++;
      if (queryCount === 1) {
        // First call: get DB record (has symbol argument)
        return { first: vi.fn().mockResolvedValue(dbRecord) };
      } else if (queryCount === 2) {
        // Second call: get push tokens (no symbol, uses .all())
        return {
          all: vi.fn().mockResolvedValue({
            results: [],
          }),
        };
      }
      return { first: vi.fn().mockResolvedValue(null) };
    });
    const prepare = vi.fn().mockReturnValue({ bind: bindDb });
    env.stockly = { prepare } as any;

    // Mock network error
    const fetchSpy = vi.spyOn(globalThis as any, "fetch").mockRejectedValue(
      new Error("Failed to fetch")
    );

    const waitUntilSpy = vi.fn();
    const ctx = { waitUntil: waitUntilSpy } as ExecutionContext;

    const url = createUrl({ symbol: "MSFT" });
    const request = createRequest({ symbol: "MSFT" });
    const response = await getStock(request, url, env, ctx, createMockLogger());
    const data = await response.json();

    expect(fetchSpy).toHaveBeenCalled();
    expect(data.stale).toBe(true);
    expect(data.stale_reason).toBe("provider_network_error");
    expect(data.price).toBe(380.0);
    expect(waitUntilSpy).toHaveBeenCalled();
  });

  it("tries alternative profile endpoints if first one fails", async () => {
    const env = createEnv();
    clearConfigCache();

    // Mock fetch to simulate failure on first profile endpoint, success on second
    const quoteJson = vi.fn().mockResolvedValue([{ symbol: "NVDA", price: 400 }]);
    const profileSuccessJson = vi.fn().mockResolvedValue([{ symbol: "NVDA", description: "Graphics cards" }]);

    // Config KV mock
    const kvMap = new Map<string, string>();
    kvMap.set("admin:config", JSON.stringify({ featureFlags: {} }));
    env.alertsKv = {
      get: vi.fn((key) => Promise.resolve(kvMap.get(key) ?? null)),
      put: vi.fn().mockResolvedValue(undefined),
    } as any;

    const fetchMock = vi.spyOn(globalThis as any, "fetch")
      .mockImplementation((url: string) => {
        if (url.includes("/quote?")) {
          return Promise.resolve({ ok: true, json: quoteJson } as Response);
        }
        // First profile endpoint fails
        if (url.includes("/profile?symbol=")) {
          return Promise.resolve({ ok: false, status: 404 } as Response);
        }
        // Second endpoint (path based) succeeds
        if (url.includes("/profile/NVDA?")) {
          return Promise.resolve({ ok: true, json: profileSuccessJson } as Response);
        }
        return Promise.resolve({ ok: false } as Response);
      });

    const url = createUrl({ symbol: "NVDA" });
    const request = createRequest({ symbol: "NVDA" });
    const response = await getStock(request, url, env, undefined, createMockLogger());

    const data = await response.json();
    expect(data.description).toBe("Graphics cards");
    // Should have called at least 3 endpoints: Quote, Profile1 (fail), Profile2 (success)
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fetches description from Wikipedia if profile description is missing", async () => {
    const env = createEnv();
    clearConfigCache();

    const quoteJson = vi.fn().mockResolvedValue([{ symbol: "TSLA", price: 200, companyName: "Tesla Inc" }]);
    // Profile succeeds but has no description
    const profileJson = vi.fn().mockResolvedValue([{ symbol: "TSLA", image: "img.png" }]);
    const wikiJson = vi.fn().mockResolvedValue({ extract: "Electric vehicle manufacturer." });

    const kvMap = new Map<string, string>();
    kvMap.set("admin:config", JSON.stringify({ featureFlags: {} }));
    env.alertsKv = {
      get: vi.fn((key) => Promise.resolve(kvMap.get(key) ?? null)),
      put: vi.fn().mockResolvedValue(undefined),
    } as any;

    const fetchMock = vi.spyOn(globalThis as any, "fetch")
      .mockImplementation((url: string) => {
        if (url.includes("/quote?")) return Promise.resolve({ ok: true, json: quoteJson } as Response);
        // All profile endpoints work but return no description
        if (url.includes("favorite")) return Promise.resolve({ ok: false } as Response); // unrelated
        if (url.includes("wikipedia")) return Promise.resolve({ ok: true, json: wikiJson } as Response);
        // Profile endpoint matches
        return Promise.resolve({ ok: true, json: profileJson } as Response);
      });

    const url = createUrl({ symbol: "TSLA" });
    const request = createRequest({ symbol: "TSLA" });
    const response = await getStock(request, url, env, undefined, createMockLogger());

    const data = await response.json();
    expect(data.description).toBe("Electric vehicle manufacturer.");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("wikipedia"));
  });

  it("throttles provider failure notifications", async () => {
    const env = createEnv();
    clearConfigCache();

    // Config allowing simulation = false
    const kvMap = new Map<string, string>();
    kvMap.set("admin:config", JSON.stringify({ featureFlags: { simulateProviderFailure: false } }));

    // Track KV puts for throttling
    const kvPuts: string[] = [];
    env.alertsKv = {
      get: vi.fn((key) => Promise.resolve(kvMap.get(key) ?? null)),
      put: vi.fn((key, val) => {
        kvPuts.push(key);
        return Promise.resolve();
      }),
    } as any;

    const dbRecord = {
      symbol: "THROTTLE_TEST", price: 300, timestamp: Math.floor(Date.now() / 1000)
    };

    // Mock DB queries
    // 1. Get cached price (first call)
    // 2. Get tokens (first failure)
    // 3. Get cached price (second call)
    // 4. Get tokens (second failure - SHOULD BE SKIPPED due to throttling, but let's see implementation)
    // Actually throttling is in-memory (throttle-cache.ts) AND possibly KV.
    // The implementation imports `isThrottled` from `throttle-cache`.
    // We need to ensure we are testing the `notifyUsersOfProviderFailure` logic.

    const prepare = vi.fn((sql: string) => {
      const stmt: any = {
        first: vi.fn().mockResolvedValue(dbRecord),
        all: vi.fn().mockResolvedValue({ results: [{ user_id: "u1", push_token: "t1" }] })
      };
      stmt.bind = vi.fn().mockReturnValue(stmt);
      return stmt;
    });
    env.stockly = { prepare } as any;

    // Fail fetch always
    vi.spyOn(globalThis as any, "fetch").mockResolvedValue({ ok: false, status: 503 });

    const waitUntilSpy = vi.fn();
    const ctx = { waitUntil: waitUntilSpy } as ExecutionContext;

    // We need to mock the dynamic import of throttle-cache inside get-stock.ts?
    // It uses `await import("./throttle-cache")`.
    // Vitest mocking might struggle with dynamic imports if not handled.
    // But `throttle-cache.ts` is simple map.
    // Let's rely on actual in-memory behavior: First call not throttled, second call (immediate) throttled.

    // 1. First failure
    const url = createUrl({ symbol: "THROTTLE_TEST" });
    const request = createRequest({ symbol: "THROTTLE_TEST" });
    await getStock(request, url, env, ctx, createMockLogger());

    // 2. Second failure (immediate)
    await getStock(request, url, env, ctx, createMockLogger());

    // Wait for async notifications
    // Each getStock calls ctx.waitUntil once if failure treated.
    // Inside notifyUsersOfProviderFailure, it calls DB to get tokens.
    // If throttled, it returns early.

    // We need to await the background tasks passed to waitUntil
    await Promise.all(waitUntilSpy.mock.calls.map(args => args[0]));

    // Check DB calls.
    // The `prepare` spy is what we can check.
    // Call 1: selects price (1), selects tokens (2).
    // Call 2: selects price (3). Should NOT select tokens if throttled.

    // Note: getStock calls `handleProviderFailure` -> `notifyUsersOfProviderFailure`
    // `notifyUsersOfProviderFailure` calls `env.stockly.prepare` for tokens.

    // Filter prepare calls to see if tokens were requested
    const prepareCalls = prepare.mock.calls.map(c => c[0]); // sql strings
    const tokenQueries = prepareCalls.filter((sql: any) => sql.includes("device_push_tokens"));

    // Should be exactly 1 token query (from first call)
    expect(tokenQueries.length).toBe(1);
  });
});
