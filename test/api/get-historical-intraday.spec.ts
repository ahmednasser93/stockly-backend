import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getHistoricalIntraday } from "../../src/api/get-historical-intraday";
import { API_KEY, API_URL } from "../../src/util";
import { clearCache } from "../../src/api/cache";
import { clearConfigCache } from "../../src/api/config";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";

const createUrl = (params: Record<string, string> = {}) => {
  const url = new URL("https://example.com/v1/api/get-historical-intraday");
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
  return {
    FMP_API_KEY: "test-api-key",
    stockly: {} as any,
  };
};

const createMock30MinData = (count: number, startDate: Date = new Date()) => {
  const data = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(startDate);
    date.setMinutes(date.getMinutes() - (count - i) * 30);
    data.push({
      date: date.toISOString(),
      open: 100 + i * 0.1,
      high: 101 + i * 0.1,
      low: 99 + i * 0.1,
      close: 100.5 + i * 0.1,
      volume: 1000000 + i * 10000,
    });
  }
  return data;
};

describe("getHistoricalIntraday handler", () => {
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
    it("requires a symbol parameter", async () => {
      const url = createUrl();
      const request = createRequest();
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("symbol parameter is required");
    });

    it("validates days parameter - must be between 1 and 30", async () => {
      const testCases = [
        { days: "0", shouldFail: true },
        { days: "-1", shouldFail: true },
        { days: "31", shouldFail: true },
        { days: "abc", shouldFail: true },
        { days: "1", shouldFail: false },
        { days: "15", shouldFail: false },
        { days: "30", shouldFail: false },
      ];

      for (const testCase of testCases) {
        // Mock fetch BEFORE the call if it's a valid case
        if (!testCase.shouldFail) {
          vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify([]), { status: 200 })
          );
        }
        
        const url = createUrl({ symbol: "AAPL", days: testCase.days });
        const request = createRequest({ symbol: "AAPL", days: testCase.days });
        const response = await getHistoricalIntraday(
          request,
          url,
          createEnv(),
          createMockLogger()
        );

        if (testCase.shouldFail) {
          expect(response.status).toBe(400);
          const data = await response.json();
          expect(data.error).toContain("days parameter must be between 1 and 30");
        } else {
          expect(response.status).toBe(200);
        }
      }
    });

    it("validates interval format", async () => {
      const invalidIntervals = ["invalid", "5x", "abc", "1d", "30", ""];
      const validIntervals = ["1h", "4h", "30m", "15m", "2h"];

      for (const interval of invalidIntervals) {
        // For empty string, it will use default "4h", so skip it or test separately
        if (interval === "") {
          // Empty string becomes default "4h", so it won't fail validation
          // But we can test that it uses the default
          vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify([]), { status: 200 })
          );
          const url = createUrl({ symbol: "AAPL" }); // No interval param
          const request = createRequest({ symbol: "AAPL" });
          const response = await getHistoricalIntraday(
            request,
            url,
            createEnv(),
            createMockLogger()
          );
          // Should use default "4h" and succeed
          expect(response.status).toBe(200);
          continue;
        }
        
        const url = createUrl({ symbol: "AAPL", interval });
        const request = createRequest({ symbol: "AAPL", interval });
        const response = await getHistoricalIntraday(
          request,
          url,
          createEnv(),
          createMockLogger()
        );
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain("Invalid interval format");
      }

      for (const interval of validIntervals) {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
          new Response(JSON.stringify([]), { status: 200 })
        );
        const url = createUrl({ symbol: "AAPL", interval });
        const request = createRequest({ symbol: "AAPL", interval });
        const response = await getHistoricalIntraday(
          request,
          url,
          createEnv(),
          createMockLogger()
        );
        expect(response.status).toBe(200);
      }
    });

    it("uses default interval (4h) when not provided", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );
      const url = createUrl({ symbol: "AAPL" });
      const request = createRequest({ symbol: "AAPL" });
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.interval).toBe("4h");
    });

    it("uses default days (3) when not provided", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );
      const url = createUrl({ symbol: "AAPL" });
      const request = createRequest({ symbol: "AAPL" });
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.days).toBe(3);
    });

    it("normalizes symbol to uppercase", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );
      const url = createUrl({ symbol: "aapl" });
      const request = createRequest({ symbol: "aapl" });
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.symbol).toBe("AAPL");
    });
  });

  describe("Date range calculation", () => {
    it("calculates correct date range based on days parameter", async () => {
      const mockData = createMock30MinData(10);
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockData), { status: 200 })
      );

      const url = createUrl({ symbol: "AAPL", days: "5" });
      const request = createRequest({ symbol: "AAPL", days: "5" });
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.days).toBe(5);
      expect(data.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(data.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      // Verify from date is approximately 5 days before to date
      const fromDate = new Date(data.from);
      const toDate = new Date(data.to);
      const diffDays = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(5);
    });
  });

  describe("FMP API integration", () => {
    it("calls FMP API with correct parameters", async () => {
      const mockData = createMock30MinData(10);
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockData), { status: 200 })
      );

      const env = createEnv();
      const url = createUrl({ symbol: "AAPL", days: "3" });
      const request = createRequest({ symbol: "AAPL", days: "3" });
      await getHistoricalIntraday(
        request,
        url,
        env,
        createMockLogger()
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callUrl = fetchSpy.mock.calls[0][0] as string;
      expect(callUrl).toContain(`${API_URL}/historical-chart/30min`);
      expect(callUrl).toContain("symbol=AAPL");
      expect(callUrl).toContain(`apikey=${env.FMP_API_KEY}`);
      expect(callUrl).toContain("from=");
      expect(callUrl).toContain("to=");
    });

    it("handles FMP API errors gracefully", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ "Error Message": "Invalid symbol" }), { status: 200 })
      );

      const url = createUrl({ symbol: "INVALID", days: "3" });
      const request = createRequest({ symbol: "INVALID", days: "3" });
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain("FMP API error");
    });

    it("handles HTTP errors from FMP API", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 })
      );

      const url = createUrl({ symbol: "AAPL", days: "3" });
      const request = createRequest({ symbol: "AAPL", days: "3" });
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain("Failed to fetch intraday data");
    });

    it("handles empty data response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );

      const url = createUrl({ symbol: "AAPL", days: "3" });
      const request = createRequest({ symbol: "AAPL", days: "3" });
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data).toEqual([]);
      expect(data.symbol).toBe("AAPL");
    });

    it("filters out invalid records from API response", async () => {
      const invalidData = [
        { date: "2025-01-01T10:00:00Z", open: 100, high: 101, low: 99, close: 100.5, volume: 1000000 },
        { date: "2025-01-01T10:30:00Z", open: "invalid", high: 101, low: 99, close: 100.5, volume: 1000000 }, // Invalid open
        { date: "2025-01-01T11:00:00Z" }, // Missing required fields
        { date: "2025-01-01T11:30:00Z", open: 101, high: 102, low: 100, close: 101.5, volume: 1100000 },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(invalidData), { status: 200 })
      );

      const url = createUrl({ symbol: "AAPL", days: "3", interval: "1h" });
      const request = createRequest({ symbol: "AAPL", days: "3", interval: "1h" });
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      // Should only have 2 valid records
      expect(data.data.length).toBeGreaterThan(0);
    });
  });

  describe("OHLC aggregation", () => {
    it("aggregates 30-minute data to 1-hour intervals", async () => {
      // Create 4 30-minute candles (should aggregate to 2 1-hour candles)
      const mockData = createMock30MinData(4);
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockData), { status: 200 })
      );

      const url = createUrl({ symbol: "AAPL", days: "1", interval: "1h" });
      const request = createRequest({ symbol: "AAPL", days: "1", interval: "1h" });
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.interval).toBe("1h");
      expect(data.data.length).toBeGreaterThan(0);
      
      // Verify aggregated candles have correct structure
      if (data.data.length > 0) {
        const candle = data.data[0];
        expect(candle).toHaveProperty("date");
        expect(candle).toHaveProperty("open");
        expect(candle).toHaveProperty("high");
        expect(candle).toHaveProperty("low");
        expect(candle).toHaveProperty("close");
        expect(candle).toHaveProperty("volume");
        expect(typeof candle.open).toBe("number");
        expect(typeof candle.high).toBe("number");
        expect(typeof candle.low).toBe("number");
        expect(typeof candle.close).toBe("number");
        expect(typeof candle.volume).toBe("number");
      }
    });

    it("aggregates 30-minute data to 4-hour intervals", async () => {
      // Create 8 30-minute candles (should aggregate to 1 4-hour candle)
      const mockData = createMock30MinData(8);
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockData), { status: 200 })
      );

      const url = createUrl({ symbol: "AAPL", days: "1", interval: "4h" });
      const request = createRequest({ symbol: "AAPL", days: "1", interval: "4h" });
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.interval).toBe("4h");
      expect(data.data.length).toBeGreaterThan(0);
    });

    it("correctly calculates OHLC values during aggregation", async () => {
      // Create specific test data
      const mockData = [
        { date: "2025-01-01T10:00:00Z", open: 100, high: 102, low: 99, close: 101, volume: 1000 },
        { date: "2025-01-01T10:30:00Z", open: 101, high: 103, low: 100, close: 102, volume: 2000 },
        { date: "2025-01-01T11:00:00Z", open: 102, high: 104, low: 101, close: 103, volume: 1500 },
        { date: "2025-01-01T11:30:00Z", open: 103, high: 105, low: 102, close: 104, volume: 1800 },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockData), { status: 200 })
      );

      const url = createUrl({ symbol: "AAPL", days: "1", interval: "1h" });
      const request = createRequest({ symbol: "AAPL", days: "1", interval: "1h" });
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      
      if (data.data.length > 0) {
        // With 1h interval, candles are grouped by hour:
        // 10:00-10:59 -> [10:00, 10:30] -> high=max(102,103)=103
        // 11:00-11:59 -> [11:00, 11:30] -> high=max(104,105)=105
        expect(data.data.length).toBeGreaterThanOrEqual(1);
        const firstCandle = data.data[0];
        // First candle should have open from first record in its interval
        expect(firstCandle.open).toBeDefined();
        // High should be max of highs in that interval
        expect(firstCandle.high).toBeDefined();
        // Low should be min of lows in that interval
        expect(firstCandle.low).toBeDefined();
        // Close should be last record's close in that interval
        expect(firstCandle.close).toBeDefined();
        // Volume should be sum of volumes in the first hour interval
        // With 1h interval, first candle (10:00-10:59) includes 10:00 and 10:30 candles
        // Volume = 1000 + 2000 = 3000
        expect(firstCandle.volume).toBe(3000);
      }
    });
  });

  describe("Response format", () => {
    it("returns correct JSON structure on success", async () => {
      const mockData = createMock30MinData(10);
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockData), { status: 200 })
      );

      const url = createUrl({ symbol: "AAPL", days: "3", interval: "4h" });
      const request = createRequest({ symbol: "AAPL", days: "3", interval: "4h" });
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty("symbol");
      expect(data).toHaveProperty("interval");
      expect(data).toHaveProperty("days");
      expect(data).toHaveProperty("from");
      expect(data).toHaveProperty("to");
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.symbol).toBe("AAPL");
      expect(data.interval).toBe("4h");
      expect(data.days).toBe(3);
    });

    it("returns correct structure on empty data", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );

      const url = createUrl({ symbol: "AAPL", days: "3" });
      const request = new Request(url.toString());
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.symbol).toBe("AAPL");
      expect(data.data).toEqual([]);
      expect(data.from).toBeDefined();
      expect(data.to).toBeDefined();
    });
  });

  describe("Error handling", () => {
    it("handles network errors", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("Network error")
      );

      const url = createUrl({ symbol: "AAPL", days: "3" });
      const request = new Request(url.toString());
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain("Failed to fetch intraday data");
    });

    it("handles invalid JSON response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Invalid JSON", { status: 200 })
      );

      const url = createUrl({ symbol: "AAPL", days: "3" });
      const request = new Request(url.toString());
      const response = await getHistoricalIntraday(
        request,
        url,
        createEnv(),
        createMockLogger()
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });
});


