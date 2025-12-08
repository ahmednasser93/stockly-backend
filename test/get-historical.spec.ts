import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getHistorical } from "../src/api/get-historical";
import { getHistoricalPricesByDateRange, fetchAndSaveHistoricalPrice } from "../src/api/historical-prices";
import { clearCache } from "../src/api/cache";
import { clearConfigCache } from "../src/api/config";
import type { Env } from "../src/index";
import { createMockLogger } from "./test-utils";

// Mock the historical-prices module
vi.mock("../src/api/historical-prices", () => ({
  getHistoricalPricesByDateRange: vi.fn(),
  fetchAndSaveHistoricalPrice: vi.fn(),
}));

const createUrl = (params: Record<string, string> = {}) => {
  const url = new URL("https://example.com/v1/api/get-historical");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
};

const createEnv = (): Env => {
  return {
    stockly: {} as any,
  };
};

const createMockData = (dates: string[]) => {
  return dates.map((date) => ({
    date,
    price: 100.0,
    volume: 1000000,
    open: 99.0,
    high: 101.0,
    low: 98.0,
    close: 100.0,
  }));
};

describe("getHistorical handler", () => {
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
      const response = await getHistorical(createUrl(), createEnv(), undefined, createMockLogger());
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("symbol parameter is required");
    });

    it("accepts symbol parameter", async () => {
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue([]);
      const response = await getHistorical(createUrl({ symbol: "AAPL" }), createEnv());
      expect(response.status).toBe(200);
    });

    it("normalizes symbol to uppercase", async () => {
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue([]);
      const response = await getHistorical(createUrl({ symbol: "aapl" }), createEnv(), undefined, createMockLogger());
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.symbol).toBe("AAPL");
    });
  });

  describe("Date range parameters (from/to)", () => {
    it("accepts from and to parameters", async () => {
      const mockData = createMockData(["2025-01-01", "2025-01-02", "2025-01-03"]);
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue(mockData);
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-31",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.symbol).toBe("AAPL");
      expect(data.from).toBe("2025-01-01");
      expect(data.to).toBe("2025-01-31");
      expect(data.data).toHaveLength(3);
    });

    it("validates from date format", async () => {
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "invalid-date",
          to: "2025-01-31",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Invalid 'from' date format");
    });

    it("validates to date format", async () => {
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "invalid-date",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Invalid 'to' date format");
    });

    it("validates that from date is before to date", async () => {
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-31",
          to: "2025-01-01",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("'from' date must be before or equal to 'to' date");
    });

    it("allows from and to to be the same date", async () => {
      const mockData = createMockData(["2025-01-01"]);
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue(mockData);
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-01",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(200);
    });

    it("defaults to today when only 'to' is provided", async () => {
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue([]);
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          to: "2025-01-31",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.to).toBe("2025-01-31");
      expect(data.from).toBeDefined();
    });

    it("defaults to today when only 'from' is provided", async () => {
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue([]);
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.from).toBe("2025-01-01");
      expect(data.to).toBeDefined();
    });
  });

  describe("Days parameter (backward compatibility)", () => {
    it("accepts days parameter", async () => {
      const mockData = createMockData(["2025-01-01", "2025-01-02"]);
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue(mockData);
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          days: "30",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.symbol).toBe("AAPL");
      expect(data.days).toBe(30);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("defaults to 180 days when no parameters provided", async () => {
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue([]);
      
      const response = await getHistorical(createUrl({ symbol: "AAPL" }), createEnv());
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.days).toBe(180);
    });

    it("validates days parameter minimum value", async () => {
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          days: "0",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("days parameter must be a positive number");
    });

    it("validates days parameter maximum value", async () => {
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          days: "4000",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("days parameter must be a positive number");
    });

    it("validates days parameter is a number", async () => {
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          days: "invalid",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("days parameter must be a positive number");
    });
  });

  describe("Parameter priority", () => {
    it("prioritizes from/to parameters over days parameter", async () => {
      const mockData = createMockData(["2025-01-01"]);
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue(mockData);
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-31",
          days: "30",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.from).toBe("2025-01-01");
      expect(data.to).toBe("2025-01-31");
      expect(data.days).toBeUndefined();
    });
  });

  describe("Database query", () => {
    it("queries database with correct date range", async () => {
      const mockData = createMockData(["2025-01-01", "2025-01-02"]);
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue(mockData);
      
      await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-31",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(getHistoricalPricesByDateRange).toHaveBeenCalledWith(
        "AAPL",
        expect.any(Date), // fromDate
        expect.any(Date), // toDate
        expect.any(Object) // env
      );
      
      const call = vi.mocked(getHistoricalPricesByDateRange).mock.calls[0];
      const fromDate = call[1] as Date;
      const toDate = call[2] as Date;
      
      expect(fromDate.toISOString().split("T")[0]).toBe("2025-01-01");
      expect(toDate.toISOString().split("T")[0]).toBe("2025-01-31");
    });

    it("returns data from database when available", async () => {
      const mockData = createMockData(["2025-01-01", "2025-01-02", "2025-01-03"]);
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue(mockData);
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-31",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data).toHaveLength(3);
      expect(data.data[0].date).toBe("2025-01-01");
    });

    it("returns empty array when database has no data", async () => {
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue([]);
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-31",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data).toHaveLength(0);
    });
  });

  describe("FMP API fallback", () => {
    it("fetches from FMP API when database is empty and ctx is available", async () => {
      vi.mocked(getHistoricalPricesByDateRange)
        .mockResolvedValueOnce([]) // First call - empty
        .mockResolvedValueOnce(createMockData(["2025-01-01"])); // Second call - after fetch
      vi.mocked(fetchAndSaveHistoricalPrice).mockResolvedValue();
      
      const env = createEnv();
      const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-31",
        }),
        env,
        ctx
      );
      
      expect(fetchAndSaveHistoricalPrice).toHaveBeenCalledWith("AAPL", env, expect.anything(), "2025-01-01", "2025-01-31");
      expect(getHistoricalPricesByDateRange).toHaveBeenCalledTimes(2);
      expect(response.status).toBe(200);
    });

    it("creates fallback ExecutionContext when ctx is not available and fetches from FMP API", async () => {
      vi.mocked(getHistoricalPricesByDateRange)
        .mockResolvedValueOnce([]) // First call - empty
        .mockResolvedValueOnce(createMockData(["2025-01-01"])); // Second call - after fetch
      vi.mocked(fetchAndSaveHistoricalPrice).mockResolvedValue();
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-31",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      // Now we create a fallback ExecutionContext, so fetchAndSaveHistoricalPrice should be called
      expect(fetchAndSaveHistoricalPrice).toHaveBeenCalled();
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data).toHaveLength(1);
    });

    it("handles FMP API fetch errors gracefully", async () => {
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue([]);
      vi.mocked(fetchAndSaveHistoricalPrice).mockRejectedValue(new Error("FMP API error"));
      
      const env = createEnv();
      const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-31",
        }),
        env,
        ctx
      );
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data).toHaveLength(0);
    });
  });

  describe("Response format", () => {
    it("returns correct response format with from/to parameters", async () => {
      const mockData = createMockData(["2025-01-01"]);
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue(mockData);
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-31",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty("symbol");
      expect(data).toHaveProperty("from");
      expect(data).toHaveProperty("to");
      expect(data).toHaveProperty("data");
      expect(data.days).toBeUndefined();
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("returns correct response format with days parameter", async () => {
      const mockData = createMockData(["2025-01-01"]);
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue(mockData);
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          days: "30",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty("symbol");
      expect(data).toHaveProperty("days");
      expect(data).toHaveProperty("data");
      // Note: from/to are also included when using days parameter (they're calculated internally)
      expect(data).toHaveProperty("from");
      expect(data).toHaveProperty("to");
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("includes all required fields in data items", async () => {
      const mockData = createMockData(["2025-01-01"]);
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue(mockData);
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-31",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      if (data.data.length > 0) {
        const item = data.data[0];
        expect(item).toHaveProperty("date");
        expect(item).toHaveProperty("price");
        expect(item).toHaveProperty("close");
        expect(item).toHaveProperty("volume");
        expect(item).toHaveProperty("open");
        expect(item).toHaveProperty("high");
        expect(item).toHaveProperty("low");
      }
    });
  });

  describe("Missing OHLC data handling", () => {
    it("re-fetches from FMP API when OHLC data is missing (null)", async () => {
      // First call: return data with null OHLC (old data)
      const mockDataWithNullOHLC = [
        {
          date: "2025-01-01",
          price: 100.0,
          volume: 1000000,
          open: null,
          high: null,
          low: null,
          close: 100.0,
        },
      ];
      
      // Second call: return data with proper OHLC (after re-fetch)
      const mockDataWithOHLC = [
        {
          date: "2025-01-01",
          price: 100.0,
          volume: 1000000,
          open: 99.0,
          high: 101.0,
          low: 98.0,
          close: 100.0,
        },
      ];
      
      vi.mocked(getHistoricalPricesByDateRange)
        .mockResolvedValueOnce(mockDataWithNullOHLC) // First call - has null OHLC
        .mockResolvedValueOnce(mockDataWithOHLC); // Second call - after re-fetch
      vi.mocked(fetchAndSaveHistoricalPrice).mockResolvedValue();
      
      const env = createEnv();
      const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as unknown as ExecutionContext;
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-31",
        }),
        env,
        ctx
      );
      
      // Should detect missing OHLC and trigger re-fetch
      expect(fetchAndSaveHistoricalPrice).toHaveBeenCalledWith("AAPL", env, ctx, "2025-01-01", "2025-01-31");
      expect(getHistoricalPricesByDateRange).toHaveBeenCalledTimes(2);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.data).toHaveLength(1);
      expect(data.data[0].open).toBe(99.0);
      expect(data.data[0].high).toBe(101.0);
      expect(data.data[0].low).toBe(98.0);
    });

    it("does not re-fetch when OHLC data is present", async () => {
      const mockDataWithOHLC = [
        {
          date: "2025-01-01",
          price: 100.0,
          volume: 1000000,
          open: 99.0,
          high: 101.0,
          low: 98.0,
          close: 100.0,
        },
      ];
      
      vi.mocked(getHistoricalPricesByDateRange).mockResolvedValue(mockDataWithOHLC);
      
      const env = createEnv();
      const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as unknown as ExecutionContext;
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-31",
        }),
        env,
        ctx
      );
      
      // Should NOT re-fetch since OHLC data is present
      expect(fetchAndSaveHistoricalPrice).not.toHaveBeenCalled();
      expect(getHistoricalPricesByDateRange).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.data[0].open).toBe(99.0);
      expect(data.data[0].high).toBe(101.0);
      expect(data.data[0].low).toBe(98.0);
    });
  });

  describe("Error handling", () => {
    it("handles database query errors gracefully", async () => {
      vi.mocked(getHistoricalPricesByDateRange).mockRejectedValue(new Error("Database error"));
      
      const response = await getHistorical(
        createUrl({
          symbol: "AAPL",
          from: "2025-01-01",
          to: "2025-01-31",
        }),
        createEnv(),
        undefined,
        createMockLogger()
      );
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data).toHaveLength(0);
    });
  });
});
