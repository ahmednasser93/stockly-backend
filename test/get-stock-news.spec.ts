import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getStockNews } from "../src/api/get-stock-news";
import { API_KEY, API_URL } from "../src/util";
import { clearCache, setCache } from "../src/api/cache";
import { clearConfigCache } from "../src/api/config";
import type { Env } from "../src/index";
import { createMockLogger } from "./test-utils";

const createUrl = (params: Record<string, string> = {}) => {
  const url = new URL("https://example.com/v1/api/get-stock-news");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
};

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

describe("getStockNews handler", () => {
  beforeEach(() => {
    clearCache();
    clearConfigCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearConfigCache();
  });

  it("requires a symbol", async () => {
    const response = await getStockNews(createUrl(), createEnv(), createMockLogger());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "symbol required" });
  });

  it("returns cached data without calling the upstream API", async () => {
    const env = createEnv();
    const cached = {
      symbol: "AAPL",
      news: [
        {
          title: "Apple announces new product",
          text: "Apple has announced...",
          url: "https://example.com/news",
          publishedDate: "2024-01-01",
        },
      ],
      cached: false,
    };
    setCache("news:AAPL", cached, 30);
    const fetchSpy = vi.spyOn(globalThis as any, "fetch");

    const response = await getStockNews(createUrl({ symbol: "aapl" }), env, createMockLogger());

    expect(fetchSpy).not.toHaveBeenCalled();
    const data = await response.json();
    expect(data.symbol).toBe("AAPL");
    expect(data.news).toBeDefined();
  });

  it("fetches news from FMP API when cache misses", async () => {
    const env = createEnv();
    const mockNews = [
      {
        title: "Apple announces new iPhone",
        text: "Apple has announced a new iPhone...",
        url: "https://example.com/news1",
        publishedDate: "2024-01-20T10:00:00Z",
        image: "https://example.com/image.jpg",
        site: "TechCrunch",
      },
      {
        title: "Apple stock rises",
        text: "Apple stock has risen...",
        url: "https://example.com/news2",
        publishedDate: "2024-01-19T15:00:00Z",
      },
    ];

    const fetchMock = vi.spyOn(globalThis as any, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockNews,
    } as Response);

    const response = await getStockNews(createUrl({ symbol: "AAPL" }), env, createMockLogger());

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/news/stock?symbols=AAPL&apikey=${API_KEY}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      })
    );

    const data = await response.json();
    expect(data.symbol).toBe("AAPL");
    expect(Array.isArray(data.news)).toBe(true);
    expect(data.news.length).toBe(2);
    expect(data.news[0].title).toBe("Apple announces new iPhone");
    expect(data.news[0].text).toBe("Apple has announced a new iPhone...");
    expect(data.news[0].url).toBe("https://example.com/news1");
    expect(data.news[0].source).toBe("TechCrunch");
  });

  it("returns empty array when FMP API returns empty array", async () => {
    const env = createEnv();

    vi.spyOn(globalThis as any, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    const response = await getStockNews(createUrl({ symbol: "XYZ" }), env, createMockLogger());

    const data = await response.json();
    expect(data.symbol).toBe("XYZ");
    expect(data.news).toEqual([]);
  });

  it("handles API errors gracefully", async () => {
    const env = createEnv();

    vi.spyOn(globalThis as any, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const response = await getStockNews(createUrl({ symbol: "AAPL" }), env, createMockLogger());

    const data = await response.json();
    expect(data.symbol).toBe("AAPL");
    expect(data.news).toEqual([]);
    expect(data.stale).toBe(true);
    expect(data.stale_reason).toBe("provider_api_error");
  });

  it("handles network errors gracefully", async () => {
    const env = createEnv();

    vi.spyOn(globalThis as any, "fetch").mockRejectedValue(new Error("Failed to fetch"));

    const response = await getStockNews(createUrl({ symbol: "AAPL" }), env, createMockLogger());

    const data = await response.json();
    expect(data).toHaveProperty("symbol", "AAPL");
    expect(data).toHaveProperty("news");
    if (data.news !== undefined) {
      expect(Array.isArray(data.news)).toBe(true);
    }
    if (data.stale !== undefined) {
      expect(data.stale).toBe(true);
      expect(data.stale_reason).toBe("provider_network_error");
    }
  });

  it("handles simulation mode", async () => {
    const env = createEnv();
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
          simulateProviderFailure: true, // Simulation enabled
        },
      })
    );
    env.alertsKv = {
      get: vi.fn((key: string) => Promise.resolve(kvMap.get(key) ?? null)),
      put: vi.fn(() => Promise.resolve()),
    } as any;

    const fetchSpy = vi.spyOn(globalThis as any, "fetch");

    const response = await getStockNews(createUrl({ symbol: "AAPL" }), env, createMockLogger());

    expect(fetchSpy).not.toHaveBeenCalled();
    const data = await response.json();
    expect(data.symbol).toBe("AAPL");
    expect(data.news).toEqual([]);
    expect(data.stale).toBe(true);
    expect(data.stale_reason).toBe("simulation_mode");
  });

  it("normalizes news data correctly", async () => {
    const env = createEnv();
    const mockNews = [
      {
        title: "Test News",
        description: "Test description",
        link: "https://example.com",
        date: "2024-01-20",
        image: "https://example.com/img.jpg",
        source: "Reuters",
      },
    ];

    vi.spyOn(globalThis as any, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockNews,
    } as Response);

    const response = await getStockNews(createUrl({ symbol: "AAPL" }), env, createMockLogger());

    const data = await response.json();
    expect(data.news[0].title).toBe("Test News");
    expect(data.news[0].text).toBe("Test description");
    expect(data.news[0].url).toBe("https://example.com"); // Should handle both 'url' and 'link' fields
    expect(data.news[0].publishedDate).toBe("2024-01-20");
    expect(data.news[0].image).toBe("https://example.com/img.jpg");
    expect(data.news[0].source).toBe("Reuters");
  });
});

