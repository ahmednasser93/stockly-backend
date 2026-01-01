/**
 * Tests for FMP API integration
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchSenateTradingFromFmp } from "../../src/api/senate-trading";
import type { Env } from "../../src/index";

describe("Senate Trading API", () => {
  let env: Env;

  beforeEach(() => {
    vi.restoreAllMocks();
    env = {
      FMP_API_KEY: "test-api-key",
    } as Env;
  });

  describe("fetchSenateTradingFromFmp", () => {
    it("should fetch and parse senate trading data", async () => {
      const mockResponse = [
        {
          symbol: "AAPL",
          senator: "Nancy Pelosi",
          type: "Purchase",
          amount_range: "$15,001 - $50,000",
          disclosure_date: "2024-01-15",
          transaction_date: "2024-01-10",
          id: "fmp-123",
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchSenateTradingFromFmp(undefined, env);

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe("AAPL");
      expect(result[0].senatorName).toBe("Nancy Pelosi");
      expect(result[0].transactionType).toBe("Purchase");
    });

    it("should handle API errors gracefully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Error message",
      });

      await expect(fetchSenateTradingFromFmp(undefined, env)).rejects.toThrow();
    });

    it("should filter by symbol when provided", async () => {
      const mockResponse: any[] = [];

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchSenateTradingFromFmp("AAPL", env);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("symbol=AAPL"),
        expect.any(Object)
      );
      expect(result).toHaveLength(0);
      
      fetchSpy.mockRestore();
    });
  });
});

