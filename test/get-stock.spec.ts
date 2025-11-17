import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getStock } from "../src/api/get-stock";
import { API_KEY, API_URL } from "../src/util";
import { clearCache, setCache, getCache } from "../src/api/cache";
import type { Env } from "../src/index";

const createUrl = (params: Record<string, string> = {}) => {
  const url = new URL("https://example.com/v1/api/get-stock");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a symbol", async () => {
    const response = await getStock(createUrl(), createEnv());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "symbol required" });
  });

  it("returns cached data without calling the upstream API", async () => {
    const cached = { symbol: "MSFT", price: 100 };
    setCache("quote:MSFT", cached, 30);
    const fetchSpy = vi.spyOn(globalThis as any, "fetch");

    const response = await getStock(createUrl({ symbol: "msft" }), createEnv());

    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual(cached);
  });

  it("fetches the quote and caches the parsed response", async () => {
    const quote = { symbol: "AAPL", price: 195 };
    const json = vi.fn().mockResolvedValue([quote]);
    const fetchMock = vi
      .spyOn(globalThis as any, "fetch")
      .mockResolvedValue({ json } as Response);

    const response = await getStock(createUrl({ symbol: "AAPL" }), createEnv());

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/quote?symbol=AAPL&apikey=${API_KEY}`,
    );
    await expect(response.json()).resolves.toEqual(quote);
    expect(getCache("quote:AAPL")).toEqual(quote);
  });

  it("returns an error when the upstream API fails", async () => {
    vi.spyOn(globalThis as any, "fetch").mockRejectedValue(new Error("fail"));

    const response = await getStock(createUrl({ symbol: "TSLA" }), createEnv());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "failed to fetch stock",
    });
  });

  it("returns stale data from DB when simulation mode is enabled", async () => {
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

    const response = await getStock(createUrl({ symbol: "AAPL" }), env);
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

    const response = await getStock(createUrl({ symbol: "AAPL" }), env);
    
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "no_price_available",
    });
  });

  it("calls provider normally when simulation is disabled", async () => {
    const env = createEnv();
    const kvMap = new Map<string, string>();
    kvMap.set(
      "admin:config",
      JSON.stringify({
        featureFlags: { simulateProviderFailure: false },
      })
    );
    env.alertsKv = {
      get: vi.fn((key: string) => Promise.resolve(kvMap.get(key) ?? null)),
    } as any;

    const quote = { symbol: "AAPL", price: 195 };
    const json = vi.fn().mockResolvedValue([quote]);
    const fetchMock = vi
      .spyOn(globalThis as any, "fetch")
      .mockResolvedValue({ ok: true, json } as Response);

    const bind = vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue(undefined) });
    const prepare = vi.fn().mockReturnValue({ bind });
    env.stockly = { prepare } as any;

    const response = await getStock(createUrl({ symbol: "AAPL" }), env);

    expect(fetchMock).toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual(quote);
  });

  it("falls back to DB and returns stale data when provider API fails", async () => {
    const env = createEnv();
    const kvMap = new Map<string, string>();
    kvMap.set(
      "admin:config",
      JSON.stringify({
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

    // Mock FCM notification (don't actually send)
    vi.spyOn(globalThis as any, "sendFCMNotification").mockResolvedValue(true);

    // Mock ctx.waitUntil for notifications
    const waitUntilSpy = vi.fn();
    const ctx = { waitUntil: waitUntilSpy } as ExecutionContext;

    const response = await getStock(createUrl({ symbol: "AAPL" }), env, ctx);
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

    const bindDb = vi.fn().mockImplementation(() => {
      queryCount++;
      if (queryCount === 1) {
        return { first: vi.fn().mockResolvedValue(dbRecord) };
      } else if (queryCount === 2) {
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

    const response = await getStock(createUrl({ symbol: "TSLA" }), env, ctx);
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

    const bindDb = vi.fn().mockImplementation(() => {
      queryCount++;
      if (queryCount === 1) {
        return { first: vi.fn().mockResolvedValue(dbRecord) };
      } else if (queryCount === 2) {
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

    const response = await getStock(createUrl({ symbol: "MSFT" }), env, ctx);
    const data = await response.json();

    expect(fetchSpy).toHaveBeenCalled();
    expect(data.stale).toBe(true);
    expect(data.stale_reason).toBe("provider_network_error");
    expect(data.price).toBe(380.0);
    expect(waitUntilSpy).toHaveBeenCalled();
  });
});
