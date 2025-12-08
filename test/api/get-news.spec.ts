import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getNews } from "../../src/api/get-news";
import { API_KEY, API_URL } from "../../src/util";
import { clearCache, setCache } from "../../src/api/cache";
import { clearConfigCache } from "../../src/api/config";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";

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
  }));
};

describe("getNews handler", () => {
  beforeEach(() => {
    clearCache();
    clearConfigCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearConfigCache();
  });

  describe("Parameter validation", () => {
    it("requires symbol or symbols parameter", async () => {
      const response = await getNews(createUrl(), createEnv(), createMockLogger());
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("symbol or symbols parameter required");
    });

    it("accepts single symbol parameter", async () => {
      const mockNews = createMockNewsData();
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const response = await getNews(
        createUrl({ symbol: "AAPL" }),
        createEnv(),
        createMockLogger()
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.symbols).toEqual(["AAPL"]);
    });

    it("accepts multiple symbols parameter", async () => {
      const mockNews = createMockNewsData();
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const response = await getNews(
        createUrl({ symbols: "AAPL,MSFT,GOOGL" }),
        createEnv(),
        createMockLogger()
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.symbols).toEqual(["AAPL", "MSFT", "GOOGL"]);
    });

    it("normalizes symbols to uppercase", async () => {
      const mockNews = createMockNewsData();
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const response = await getNews(
        createUrl({ symbol: "aapl" }),
        createEnv(),
        createMockLogger()
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.symbols).toEqual(["AAPL"]);
    });

    it("removes duplicate symbols", async () => {
      const mockNews = createMockNewsData();
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const response = await getNews(
        createUrl({ symbols: "AAPL,MSFT,AAPL,GOOGL" }),
        createEnv(),
        createMockLogger()
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.symbols).toEqual(["AAPL", "GOOGL", "MSFT"]); // Sorted
    });

    it("limits to maximum 10 symbols", async () => {
      const response = await getNews(
        createUrl({ symbols: "AAPL,MSFT,GOOGL,AMZN,TSLA,NVDA,META,NFLX,AMD,INTC,QQQ" }),
        createEnv(),
        createMockLogger()
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("maximum 10 symbols allowed");
    });

    it("validates date format (from parameter)", async () => {
      const testCases = [
        { from: "2025-01-01", shouldFail: false },
        { from: "2025-1-1", shouldFail: true },
        { from: "01-01-2025", shouldFail: true },
        { from: "invalid", shouldFail: true },
        { from: "2025-13-01", shouldFail: true }, // Invalid month
      ];

      for (const testCase of testCases) {
        const response = await getNews(
          createUrl({ symbol: "AAPL", from: testCase.from }),
          createEnv(),
          createMockLogger()
        );

        if (testCase.shouldFail) {
          expect(response.status).toBe(400);
          const data = await response.json();
          expect(data.error).toContain("invalid 'from' date format");
        } else {
          // Mock fetch to avoid actual API call
          vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify([]), { status: 200 })
          );
          expect(response.status).toBe(200);
        }
      }
    });

    it("validates date format (to parameter)", async () => {
      const testCases = [
        { to: "2025-01-31", shouldFail: false },
        { to: "invalid", shouldFail: true },
      ];

      for (const testCase of testCases) {
        const response = await getNews(
          createUrl({ symbol: "AAPL", to: testCase.to }),
          createEnv(),
          createMockLogger()
        );

        if (testCase.shouldFail) {
          expect(response.status).toBe(400);
          const data = await response.json();
          expect(data.error).toContain("invalid 'to' date format");
        } else {
          vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify([]), { status: 200 })
          );
          expect(response.status).toBe(200);
        }
      }
    });

    it("validates date range (from must be <= to)", async () => {
      const response = await getNews(
        createUrl({ symbol: "AAPL", from: "2025-01-31", to: "2025-01-01" }),
        createEnv(),
        createMockLogger()
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("'from' date must be before or equal to 'to' date");
    });

    it("validates page parameter", async () => {
      const testCases = [
        { page: "0", shouldFail: false },
        { page: "1", shouldFail: false },
        { page: "-1", shouldFail: true },
        { page: "abc", shouldFail: true },
      ];

      for (const testCase of testCases) {
        const response = await getNews(
          createUrl({ symbol: "AAPL", page: testCase.page }),
          createEnv(),
          createMockLogger()
        );

        if (testCase.shouldFail) {
          expect(response.status).toBe(400);
          const data = await response.json();
          expect(data.error).toContain("invalid 'page' parameter");
        } else {
          vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify([]), { status: 200 })
          );
          expect(response.status).toBe(200);
        }
      }
    });

    it("validates limit parameter", async () => {
      const testCases = [
        { limit: "1", shouldFail: false },
        { limit: "20", shouldFail: false },
        { limit: "250", shouldFail: false },
        { limit: "0", shouldFail: true },
        { limit: "-1", shouldFail: true },
        { limit: "251", shouldFail: true }, // Should be capped at 250
        { limit: "abc", shouldFail: true },
      ];

      for (const testCase of testCases) {
        const response = await getNews(
          createUrl({ symbol: "AAPL", limit: testCase.limit }),
          createEnv(),
          createMockLogger()
        );

        if (testCase.shouldFail) {
          expect(response.status).toBe(400);
          const data = await response.json();
          expect(data.error).toContain("invalid 'limit' parameter");
        } else {
          vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify([]), { status: 200 })
          );
          expect(response.status).toBe(200);
        }
      }
    });

    it("caps limit at 250", async () => {
      const mockNews = createMockNewsData();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      await getNews(
        createUrl({ symbol: "AAPL", limit: "500" }),
        createEnv(),
        createMockLogger()
      );

      const callUrl = fetchSpy.mock.calls[0][0] as string;
      expect(callUrl).toContain("limit=250");
    });
  });

  describe("FMP API integration", () => {
    it("calls FMP API with correct parameters for single symbol", async () => {
      const mockNews = createMockNewsData();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      await getNews(
        createUrl({ symbol: "AAPL" }),
        createEnv(),
        createMockLogger()
      );

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

      await getNews(
        createUrl({ symbols: "AAPL,MSFT,GOOGL" }),
        createEnv(),
        createMockLogger()
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callUrl = fetchSpy.mock.calls[0][0] as string;
      expect(callUrl).toContain("symbols=AAPL,MSFT,GOOGL");
    });

    it("includes pagination parameters in API call", async () => {
      const mockNews = createMockNewsData();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      await getNews(
        createUrl({ symbol: "AAPL", page: "1", limit: "50", from: "2025-01-01", to: "2025-01-31" }),
        createEnv(),
        createMockLogger()
      );

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

      const response = await getNews(
        createUrl({ symbol: "AAPL" }),
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200); // Returns 200 with error flag
      const data = await response.json();
      expect(data.error).toBe("Failed to fetch news");
      expect(data.news).toEqual([]);
    });

    it("handles HTTP errors from FMP API", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 })
      );

      const response = await getNews(
        createUrl({ symbol: "AAPL" }),
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200); // Returns 200 with error flag
      const data = await response.json();
      expect(data.error).toBe("Failed to fetch news");
      expect(data.partial).toBe(true);
    });

    it("handles network errors", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("Network error")
      );

      const response = await getNews(
        createUrl({ symbol: "AAPL" }),
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200); // Returns 200 with error flag
      const data = await response.json();
      expect(data.error).toBe("Failed to fetch news");
      expect(data.partial).toBe(true);
    });
  });

  describe("Caching behavior", () => {
    it("returns cached data when available and valid", async () => {
      const env = createEnv();
      const cachedNews = createMockNewsData();
      setCache("news:AAPL", { news: cachedNews, pagination: { page: 0, limit: 20, total: cachedNews.length } }, 30);

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const response = await getNews(
        createUrl({ symbol: "AAPL" }),
        env,
        createMockLogger()
      );

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cached).toBe(true);
      expect(data.news).toEqual(cachedNews);
    });

    it("fetches from API when cache is expired", async () => {
      const env = createEnv();
      const cachedNews = createMockNewsData();
      // Set cache with old timestamp (expired)
      setCache("news:AAPL", { news: cachedNews, pagination: { page: 0, limit: 20, total: cachedNews.length } }, 30);
      // Manually expire cache by setting old cachedAt
      const cache = (globalThis as any).__cache || {};
      if (cache["news:AAPL"]) {
        cache["news:AAPL"].cachedAt = Date.now() - 60000; // 60 seconds ago
      }

      const mockNews = createMockNewsData(10);
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const response = await getNews(
        createUrl({ symbol: "AAPL" }),
        env,
        createMockLogger()
      );

      expect(fetchSpy).toHaveBeenCalled();
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cached).toBe(false);
    });

    it("does not cache when pagination parameters are present", async () => {
      const env = createEnv();
      const mockNews = createMockNewsData();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const response = await getNews(
        createUrl({ symbol: "AAPL", page: "1", limit: "50" }),
        env,
        createMockLogger()
      );

      expect(fetchSpy).toHaveBeenCalled();
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cached).toBe(false);
    });
  });

  describe("News normalization", () => {
    it("normalizes news items to consistent format", async () => {
      const rawNews = [
        {
          title: "Test Article",
          headline: "Alternative Headline", // Should prefer title
          text: "Article text",
          description: "Alternative description", // Should prefer text
          url: "https://example.com/article",
          link: "https://example.com/alt-link", // Should prefer url
          publishedDate: "2025-01-01T10:00:00Z",
          date: "2025-01-01T11:00:00Z", // Should prefer publishedDate
          image: "https://example.com/image.jpg",
          imageUrl: "https://example.com/alt-image.jpg", // Should prefer image
          site: "TechCrunch",
          source: "Alternative Source", // Should prefer site
          type: "news",
        },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(rawNews), { status: 200 })
      );

      const response = await getNews(
        createUrl({ symbol: "AAPL" }),
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.news.length).toBe(1);
      const newsItem = data.news[0];
      expect(newsItem.title).toBe("Test Article");
      expect(newsItem.text).toBe("Article text");
      expect(newsItem.url).toBe("https://example.com/article");
      expect(newsItem.publishedDate).toBe("2025-01-01T10:00:00Z");
      expect(newsItem.image).toBe("https://example.com/image.jpg");
      expect(newsItem.site).toBe("TechCrunch");
      expect(newsItem.type).toBe("news");
    });
  });

  describe("Pagination", () => {
    it("includes pagination metadata in response", async () => {
      const mockNews = createMockNewsData(20);
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const response = await getNews(
        createUrl({ symbol: "AAPL", page: "0", limit: "20" }),
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(0);
      expect(data.pagination.limit).toBe(20);
      expect(data.pagination.total).toBe(20);
      expect(data.pagination.hasMore).toBeDefined();
    });

    it("uses default pagination when not provided", async () => {
      const mockNews = createMockNewsData();
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockNews), { status: 200 })
      );

      const response = await getNews(
        createUrl({ symbol: "AAPL" }),
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
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

      const response = await getNews(
        createUrl({ symbol: "AAPL" }),
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty("symbols");
      expect(data).toHaveProperty("news");
      expect(data).toHaveProperty("pagination");
      expect(data).toHaveProperty("cached");
      expect(Array.isArray(data.symbols)).toBe(true);
      expect(Array.isArray(data.news)).toBe(true);
      expect(data.symbols).toEqual(["AAPL"]);
    });

    it("returns correct structure on error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("Network error")
      );

      const response = await getNews(
        createUrl({ symbol: "AAPL" }),
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200); // Returns 200 with error flag
      const data = await response.json();
      expect(data.symbols).toEqual(["AAPL"]);
      expect(data.news).toEqual([]);
      expect(data.error).toBe("Failed to fetch news");
      expect(data.partial).toBe(true);
      expect(data.pagination).toBeDefined();
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

      const response = await getNews(
        createUrl({ symbol: "AAPL" }),
        env,
        createMockLogger()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.news).toEqual([]);
      expect(data.partial).toBe(true);
      expect(data.stale_reason).toBe("simulation_mode");
    });
  });
});


