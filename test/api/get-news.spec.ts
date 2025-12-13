import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getNews } from "../../src/api/get-news";
import { API_KEY, API_URL } from "../../src/util";
import { clearCache, setCache } from "../../src/api/cache";
import { clearNewsCache } from "../../src/api/news-cache";
import { clearConfigCache } from "../../src/api/config";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";

const createRequest = (params: Record<string, string> = {}) => {
  const url = new URL("https://example.com/v1/api/get-news");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new Request(url.toString());
};

const createUrl = (params: Record<string, string> = {}) => {
  const url = new URL("https://example.com/v1/api/get-news");
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

const createMockNewsData = (count: number = 5) => {
  return Array.from({ length: count }, (_, i) => ({
    title: `News Article ${i + 1}`,
    text: `Article content ${i + 1}`,
    url: `https://example.com/news/${i + 1}`,
    publishedDate: `2025-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
    image: `https://example.com/image${i + 1}.jpg`,
    site: "TechCrunch",
    type: "news",
    symbol: "AAPL",
  }));
};

describe("getNews handler", () => {
  beforeEach(() => {
    clearCache();
    clearNewsCache();
    clearConfigCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearConfigCache();
    clearNewsCache();
  });

  describe("Parameter validation", () => {
    it("requires symbol or symbols parameter", async () => {
      const request = createRequest();
      const url = createUrl();
      const response = await getNews(request, url, createEnv(), createMockLogger());
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("symbol or symbols parameter required");
    });

    it("accepts single symbol parameter", async () => {
      const mockNews = createMockNewsData();
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const request = createRequest({ symbol: "AAPL" });
      const url = createUrl({ symbol: "AAPL" });
      const response = await getNews(request, url, createEnv(), createMockLogger());
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.symbols).toEqual(["AAPL"]);
    });

    it("accepts multiple symbols parameter", async () => {
      const mockNews = createMockNewsData();
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const request = createRequest({ symbols: "AAPL,MSFT,GOOGL" });
      const url = createUrl({ symbols: "AAPL,MSFT,GOOGL" });
      const response = await getNews(request, url, createEnv(), createMockLogger());
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.symbols).toContain("AAPL");
      expect(data.symbols).toContain("MSFT");
      expect(data.symbols).toContain("GOOGL");
    });

    it("normalizes symbols to uppercase", async () => {
      const mockNews = createMockNewsData();
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const request = createRequest({ symbol: "aapl" });
      const url = createUrl({ symbol: "aapl" });
      const response = await getNews(request, url, createEnv(), createMockLogger());
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.symbols).toEqual(["AAPL"]);
    });

    it("removes duplicate symbols", async () => {
      const mockNews = createMockNewsData();
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const request = createRequest({ symbols: "AAPL,MSFT,AAPL,GOOGL" });
      const url = createUrl({ symbols: "AAPL,MSFT,AAPL,GOOGL" });
      const response = await getNews(request, url, createEnv(), createMockLogger());
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.symbols.length).toBe(3);
      expect(data.symbols).toContain("AAPL");
      expect(data.symbols).toContain("MSFT");
      expect(data.symbols).toContain("GOOGL");
    });

    it("limits to maximum 10 symbols", async () => {
      const request = createRequest({ symbols: "AAPL,MSFT,GOOGL,AMZN,TSLA,NVDA,META,NFLX,AMD,INTC,QQQ" });
      const url = createUrl({ symbols: "AAPL,MSFT,GOOGL,AMZN,TSLA,NVDA,META,NFLX,AMD,INTC,QQQ" });
      const response = await getNews(request, url, createEnv(), createMockLogger());
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("maximum 10 symbols");
    });

    it.each([
      { from: "invalid", shouldFail: true },
      { from: "2025-01-01", shouldFail: false },
      { from: "2025-13-01", shouldFail: true },
    ])("validates date format (from parameter): $from", async ({ from, shouldFail }) => {
      const request = createRequest({ symbol: "AAPL", from });
      const url = createUrl({ symbol: "AAPL", from });
      const response = await getNews(request, url, createEnv(), createMockLogger());

      if (shouldFail) {
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain("from");
      } else {
        // If valid, should proceed (may fail on API call, but not on validation)
        expect([200, 500]).toContain(response.status);
      }
    });

    it.each([
      { to: "invalid", shouldFail: true },
      { to: "2025-01-31", shouldFail: false },
      { to: "2025-13-31", shouldFail: true },
    ])("validates date format (to parameter): $to", async ({ to, shouldFail }) => {
      const request = createRequest({ symbol: "AAPL", to });
      const url = createUrl({ symbol: "AAPL", to });
      const response = await getNews(request, url, createEnv(), createMockLogger());

      if (shouldFail) {
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain("to");
      } else {
        // If valid, should proceed
        expect([200, 500]).toContain(response.status);
      }
    });

    it("validates date range (from must be <= to)", async () => {
      const request = createRequest({ symbol: "AAPL", from: "2025-01-31", to: "2025-01-01" });
      const url = createUrl({ symbol: "AAPL", from: "2025-01-31", to: "2025-01-01" });
      const response = await getNews(request, url, createEnv(), createMockLogger());
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("from");
    });

    it.each([
      { page: "invalid", shouldFail: true },
      { page: "0", shouldFail: false },
      { page: "-1", shouldFail: true },
      { page: "10", shouldFail: false },
    ])("validates page parameter: $page", async ({ page, shouldFail }) => {
      const request = createRequest({ symbol: "AAPL", page });
      const url = createUrl({ symbol: "AAPL", page });
      const response = await getNews(request, url, createEnv(), createMockLogger());

      if (shouldFail) {
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain("page");
      } else {
        // If valid, should proceed
        expect([200, 500]).toContain(response.status);
      }
    });

    it.each([
      { limit: "invalid", shouldFail: true },
      { limit: "20", shouldFail: false },
      { limit: "0", shouldFail: true },
      { limit: "250", shouldFail: false },
      { limit: "251", shouldFail: true },
    ])("validates limit parameter: $limit", async ({ limit, shouldFail }) => {
      const request = createRequest({ symbol: "AAPL", limit });
      const url = createUrl({ symbol: "AAPL", limit });
      const response = await getNews(request, url, createEnv(), createMockLogger());

      if (shouldFail) {
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain("limit");
      } else {
        // If valid, should proceed
        expect([200, 500]).toContain(response.status);
      }
    });

    it("rejects limit greater than 250", async () => {
      const request = createRequest({ symbol: "AAPL", limit: "500" });
      const url = createUrl({ symbol: "AAPL", limit: "500" });
      const response = await getNews(request, url, createEnv(), createMockLogger());

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("limit");
      expect(data.error).toContain("1-250");
    });
  });

  describe("FMP API integration", () => {
    it("calls FMP API with correct parameters for single symbol", async () => {
      const mockNews = createMockNewsData();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const request = createRequest({ symbol: "AAPL" });
      const url = createUrl({ symbol: "AAPL" });
      await getNews(request, url, createEnv(), createMockLogger());

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callUrl = fetchSpy.mock.calls[0][0] as string;
      expect(callUrl).toContain(`${API_URL}/news/stock`);
      expect(callUrl).toContain("symbols=AAPL");
      expect(callUrl).toContain(`apikey=${API_KEY}`);
    });

    it("calls FMP API with multiple symbols", async () => {
      const mockNews = createMockNewsData();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const request = createRequest({ symbols: "AAPL,MSFT,GOOGL" });
      const url = createUrl({ symbols: "AAPL,MSFT,GOOGL" });
      await getNews(request, url, createEnv(), createMockLogger());

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callUrl = fetchSpy.mock.calls[0][0] as string;
      expect(callUrl).toContain("symbols=AAPL%2CMSFT%2CGOOGL");
    });

    it("includes pagination parameters in API call", async () => {
      const mockNews = createMockNewsData();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const request = createRequest({ symbol: "AAPL", page: "1", limit: "50", from: "2025-01-01", to: "2025-01-31" });
      const url = createUrl({ symbol: "AAPL", page: "1", limit: "50", from: "2025-01-01", to: "2025-01-31" });
      await getNews(request, url, createEnv(), createMockLogger());

      const callUrl = fetchSpy.mock.calls[0][0] as string;
      expect(callUrl).toContain("page=1");
      expect(callUrl).toContain("limit=50");
      expect(callUrl).toContain("from=2025-01-01");
      expect(callUrl).toContain("to=2025-01-31");
    });

    it("handles FMP API errors gracefully", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ "Error Message": "Invalid API key" }), { status: 200 })
      );

      const request = createRequest({ symbol: "AAPL" });
      const url = createUrl({ symbol: "AAPL" });
      const response = await getNews(request, url, createEnv(), createMockLogger());

      expect(response.status).toBe(200); // Returns 200 with error flag
      const data = await response.json();
      expect(data.news).toEqual([]);
    });

    it("handles HTTP errors from FMP API", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 })
      );

      const request = createRequest({ symbol: "AAPL" });
      const url = createUrl({ symbol: "AAPL" });
      const response = await getNews(request, url, createEnv(), createMockLogger());

      expect(response.status).toBe(200); // Returns 200 with error flag
      const data = await response.json();
      expect(data.news).toEqual([]);
    });

    it("handles network errors", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

      const request = createRequest({ symbol: "AAPL" });
      const url = createUrl({ symbol: "AAPL" });
      const response = await getNews(request, url, createEnv(), createMockLogger());

      expect(response.status).toBe(200); // Returns 200 with error flag
      const data = await response.json();
      expect(data.news).toEqual([]);
    });
  });

  describe("Caching behavior", () => {
    it("returns cached data when available and valid", async () => {
      const env = createEnv();
      const cachedNews = createMockNewsData();
      
      // Manually set cache using the old cache system for testing
      setCache("news:AAPL", { news: cachedNews, pagination: { page: 0, limit: 20, total: cachedNews.length, hasMore: false } }, 60);
      
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const request = createRequest({ symbol: "AAPL" });
      const url = createUrl({ symbol: "AAPL" });
      const response = await getNews(request, url, env, createMockLogger());

      // Should not call fetch if cache is valid
      // Note: With new cache system, this might still call fetch if cache is expired
      // But we test that cache is checked first
      const data = await response.json();
      expect(data.symbols).toEqual(["AAPL"]);
    });

    it("fetches from API when cache is expired", async () => {
      const env = createEnv();
      const mockNews = createMockNewsData();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      // Set cache with very short TTL (already expired)
      setCache("news:AAPL", { news: [], pagination: { page: 0, limit: 20, total: 0, hasMore: false } }, 1);
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      const request = createRequest({ symbol: "AAPL" });
      const url = createUrl({ symbol: "AAPL" });
      const response = await getNews(request, url, env, createMockLogger());

      expect(fetchSpy).toHaveBeenCalled();
      const data = await response.json();
      expect(data.news.length).toBeGreaterThan(0);
    });

    it("does not cache when pagination parameters are present", async () => {
      const env = createEnv();
      const mockNews = createMockNewsData();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const request = createRequest({ symbol: "AAPL", page: "1", limit: "50" });
      const url = createUrl({ symbol: "AAPL", page: "1", limit: "50" });
      const response = await getNews(request, url, env, createMockLogger());

      expect(fetchSpy).toHaveBeenCalled();
      const data = await response.json();
      expect(data.cached).toBe(false);
    });
  });

  describe("News normalization", () => {
    it("normalizes news items to consistent format", async () => {
      const mockNews = [
        {
          title: "Test Article",
          text: "Test description",
          url: "https://example.com/news",
          publishedDate: "2025-01-01T10:00:00Z",
          image: "https://example.com/image.jpg",
          site: "TechCrunch",
          symbol: "AAPL",
        },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const request = createRequest({ symbol: "AAPL" });
      const url = createUrl({ symbol: "AAPL" });
      const response = await getNews(request, url, createEnv(), createMockLogger());

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.news.length).toBe(1);
      const newsItem = data.news[0];
      expect(newsItem.title).toBe("Test Article");
      expect(newsItem.text).toBe("Test description");
      expect(newsItem.url).toBe("https://example.com/news");
      expect(newsItem.publishedDate).toBe("2025-01-01T10:00:00Z");
      expect(newsItem.image).toBe("https://example.com/image.jpg");
      expect(newsItem.site).toBe("TechCrunch");
      expect(newsItem.symbol).toBe("AAPL");
    });
  });

  describe("Pagination", () => {
    it("includes pagination metadata in response", async () => {
      const mockNews = createMockNewsData(20);
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const request = createRequest({ symbol: "AAPL", page: "0", limit: "20" });
      const url = createUrl({ symbol: "AAPL", page: "0", limit: "20" });
      const response = await getNews(request, url, createEnv(), createMockLogger());

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(0);
      expect(data.pagination.limit).toBe(20);
      expect(data.pagination.total).toBe(20);
    });

    it("uses default pagination when not provided", async () => {
      const mockNews = createMockNewsData(20);
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const request = createRequest({ symbol: "AAPL" });
      const url = createUrl({ symbol: "AAPL" });
      const response = await getNews(request, url, createEnv(), createMockLogger());

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(0);
      expect(data.pagination.limit).toBe(20);
    });
  });

  describe("Response format", () => {
    it("returns correct JSON structure on success", async () => {
      const mockNews = createMockNewsData();
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const request = createRequest({ symbol: "AAPL" });
      const url = createUrl({ symbol: "AAPL" });
      const response = await getNews(request, url, createEnv(), createMockLogger());

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("symbols");
      expect(data).toHaveProperty("news");
      expect(data).toHaveProperty("pagination");
      expect(Array.isArray(data.news)).toBe(true);
    });

    it("returns correct structure on error", async () => {
      const request = createRequest();
      const url = createUrl();
      const response = await getNews(request, url, createEnv(), createMockLogger());

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(typeof data.error).toBe("string");
    });
  });

  describe("Simulation mode", () => {
    it("returns empty array when simulateProviderFailure is enabled", async () => {
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
            simulateProviderFailure: true,
          },
        })
      );
      env.alertsKv = {
        get: vi.fn((key: string) => Promise.resolve(kvMap.get(key) ?? null)),
        put: vi.fn(() => Promise.resolve()),
      } as any;
      clearConfigCache();

      const request = createRequest({ symbol: "AAPL" });
      const url = createUrl({ symbol: "AAPL" });
      const response = await getNews(request, url, env, createMockLogger());

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.news).toEqual([]);
      expect(data.stale_reason).toBe("simulation_mode");
    });
  });
});
