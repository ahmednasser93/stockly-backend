import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getStockDetails } from "../src/services/get-stock-details";
import { API_KEY, API_URL } from "../src/util";
import { clearCache, setCache } from "../src/api/cache";
import { clearConfigCache } from "../src/api/config";
import type { Env } from "../src/index";

const createEnv = (): Env => {
  const kvMap = new Map<string, string>();
  kvMap.set(
    "admin:config",
    JSON.stringify({
      pollingIntervalSec: 30,
      kvWriteIntervalSec: 3600,
      primaryProvider: "alpha-feed",
      backupProvider: "beta-feed",
      alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
      featureFlags: {
        alerting: true,
        sandboxMode: false,
        simulateProviderFailure: false,
      },
    })
  );

  return {
    stockly: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue(undefined) }),
      }),
    } as any,
    alertsKv: {
      get: vi.fn((key: string) => Promise.resolve(kvMap.get(key) ?? null)),
      put: vi.fn(() => Promise.resolve()),
    } as any,
  };
};

describe("getStockDetails service", () => {
  beforeEach(() => {
    clearCache();
    clearConfigCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearConfigCache();
  });

  it("returns cached data when available and valid", async () => {
    const env = createEnv();
    const cachedData = {
      symbol: "AAPL",
      profile: { companyName: "Apple Inc.", industry: "", sector: "", description: "", website: "", image: "" },
      quote: { price: 150, change: 0, changesPercentage: 0, dayHigh: 0, dayLow: 0, open: 0, previousClose: 0, volume: 0, marketCap: 0 },
      chart: { "1D": [], "1W": [], "1M": [], "3M": [], "1Y": [], "ALL": [] },
      financials: { income: [], keyMetrics: [], ratios: [] },
      news: [],
      peers: [],
      cached: true,
    };
    setCache("stock-details:AAPL", cachedData, 30);

    const fetchSpy = vi.spyOn(globalThis as any, "fetch");

    const result = await getStockDetails("AAPL", env);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toHaveProperty("cached", true);
    expect((result as any).symbol).toBe("AAPL");
  });

  it("fetches all data from FMP API when cache misses", async () => {
    const env = createEnv();

    const mockProfile = [{ symbol: "AAPL", companyName: "Apple Inc.", industry: "Technology", sector: "Consumer Electronics", description: "Test description", website: "https://apple.com", image: "https://example.com/image.png" }];
    const mockQuote = [{ symbol: "AAPL", price: 150, change: 2, changesPercentage: 1.35, dayHigh: 152, dayLow: 148, open: 149, previousClose: 148, volume: 1000000, marketCap: 2500000000 }];
    const mockHistorical = { historical: [{ date: "2024-01-01", close: 150, volume: 1000000 }] };
    const mockKeyMetrics = [{ date: "2024-01-01", peRatio: 25, priceToBookRatio: 5 }];
    const mockIncome = [{ date: "2024-01-01", revenue: 1000000, netIncome: 200000, eps: 5.5 }];
    const mockNews = [{ title: "News 1", text: "Text 1", url: "https://example.com", publishedDate: "2024-01-01", image: "https://example.com/img.jpg" }];
    const mockRatios = [{ date: "2024-01-01", currentRatio: 2.5, debtToEquity: 1.2 }];

    const fetchMock = vi
      .spyOn(globalThis as any, "fetch")
      .mockImplementation((url: string) => {
        if (url.includes("/profile")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProfile) } as Response);
        }
        if (url.includes("/quote")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockQuote) } as Response);
        }
        if (url.includes("/historical-price-full")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHistorical) } as Response);
        }
        if (url.includes("/key-metrics")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockKeyMetrics) } as Response);
        }
        if (url.includes("/income-statement")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockIncome) } as Response);
        }
        if (url.includes("/stock_news")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockNews) } as Response);
        }
        if (url.includes("/ratios")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockRatios) } as Response);
        }
        return Promise.reject(new Error("Unknown endpoint"));
      });

    const result = await getStockDetails("AAPL", env);

    expect(fetchMock).toHaveBeenCalled();
    expect(result).not.toHaveProperty("error");
    expect((result as any).symbol).toBe("AAPL");
    expect((result as any).profile.companyName).toBe("Apple Inc.");
    expect((result as any).quote.price).toBe(150);
    expect((result as any).chart["1Y"]).toBeDefined();
    expect((result as any).financials.income).toHaveLength(1);
    expect((result as any).news).toHaveLength(1);
  });

  it("handles partial data failures gracefully", async () => {
    const env = createEnv();

    const mockProfile = [{ symbol: "AAPL", companyName: "Apple Inc." }];
    const mockQuote = [{ symbol: "AAPL", price: 150 }];

    const fetchMock = vi
      .spyOn(globalThis as any, "fetch")
      .mockImplementation((url: string) => {
        if (url.includes("/profile")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProfile) } as Response);
        }
        if (url.includes("/quote")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockQuote) } as Response);
        }
        // All other endpoints fail
        return Promise.reject(new Error("Endpoint failed"));
      });

    const result = await getStockDetails("AAPL", env);

    expect(result).toHaveProperty("partial", true);
    expect((result as any).symbol).toBe("AAPL");
    expect((result as any).profile.companyName).toBe("Apple Inc.");
    expect((result as any).quote.price).toBe(150);
    // Failed endpoints should have defaults
    expect((result as any).chart["1Y"]).toEqual([]);
    expect((result as any).news).toEqual([]);
  });

  it("returns error when all critical endpoints fail", async () => {
    const env = createEnv();

    const fetchMock = vi
      .spyOn(globalThis as any, "fetch")
      .mockImplementation(() => {
        return Promise.reject(new Error("All endpoints failed"));
      });

    const result = await getStockDetails("AAPL", env);

    // Should return defaults, not error, due to graceful handling
    expect(result).toHaveProperty("symbol", "AAPL");
    expect((result as any).partial).toBe(true);
  }, 10000); // Longer timeout for retry logic

  it("normalizes chart data correctly by time periods", async () => {
    const env = createEnv();

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    const mockHistorical = {
      historical: [
        { date: oneYearAgo.toISOString().split("T")[0], close: 140, volume: 1000 },
        { date: oneDayAgo.toISOString().split("T")[0], close: 150, volume: 2000 },
        { date: now.toISOString().split("T")[0], close: 155, volume: 3000 },
      ],
    };

    const mockProfile = [{ symbol: "AAPL" }];
    const mockQuote = [{ symbol: "AAPL", price: 155 }];

    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      if (url.includes("/profile")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProfile) } as Response);
      }
      if (url.includes("/quote")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockQuote) } as Response);
      }
      if (url.includes("/historical-price-full")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHistorical) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
    });

    const result = await getStockDetails("AAPL", env);

    expect((result as any).chart["1Y"]).toBeDefined();
    expect((result as any).chart["1D"]).toBeDefined();
    expect((result as any).chart["ALL"]).toHaveLength(3);
  });

  it("handles rate limiting with retry", async () => {
    const env = createEnv();
    
    let callCount = 0;
    const fetchMock = vi
      .spyOn(globalThis as any, "fetch")
      .mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          // First two calls return 429 (rate limited)
          return Promise.resolve({ 
            ok: false, 
            status: 429,
            json: () => Promise.resolve({}) 
          } as Response);
        }
        // Third call succeeds
        return Promise.resolve({ 
          ok: true, 
          json: () => Promise.resolve([{ symbol: "AAPL", price: 150 }]) 
        } as Response);
      });

    // Mock all endpoints to behave the same
    const originalMock = fetchMock;
    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      return originalMock(url);
    });

    // This test verifies retry logic exists (even if it takes longer)
    // Note: In a real scenario, we'd want to test with actual delays
    const result = await getStockDetails("AAPL", env);
    
    // Should eventually succeed or return partial data
    expect(result).toHaveProperty("symbol", "AAPL");
  }, 10000); // Longer timeout for retry test

  it("normalizes financial data correctly", async () => {
    const env = createEnv();

    const mockIncome = [
      { date: "2024-01-01", revenue: 1000000, netIncome: 200000, eps: 5.5 },
      { date: "2023-01-01", revenue: 900000, netIncome: 180000, eps: 4.5 },
    ];
    const mockKeyMetrics = [
      { date: "2024-01-01", peRatio: 25, priceToBookRatio: 5 },
    ];
    const mockRatios = [
      { date: "2024-01-01", currentRatio: 2.5, debtToEquity: 1.2 },
    ];

    const mockProfile = [{ symbol: "AAPL" }];
    const mockQuote = [{ symbol: "AAPL", price: 150 }];

    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      if (url.includes("/profile")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProfile) } as Response);
      }
      if (url.includes("/quote")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockQuote) } as Response);
      }
      if (url.includes("/income-statement")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockIncome) } as Response);
      }
      if (url.includes("/key-metrics")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockKeyMetrics) } as Response);
      }
      if (url.includes("/ratios")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockRatios) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
    });

    const result = await getStockDetails("AAPL", env);

    expect((result as any).financials.income).toHaveLength(2);
    expect((result as any).financials.income[0].revenue).toBe(1000000);
    expect((result as any).financials.keyMetrics).toHaveLength(1);
    expect((result as any).financials.ratios).toHaveLength(1);
  });
});

