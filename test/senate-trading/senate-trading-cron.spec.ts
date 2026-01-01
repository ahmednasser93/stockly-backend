/**
 * Tests for Senate Trading Cron Job
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { runSenateTradingCron } from "../../src/cron/senate-trading-cron";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";

describe("Senate Trading Cron", () => {
  let env: Env;

  beforeEach(() => {
    vi.restoreAllMocks();
    env = {
      FMP_API_KEY: "test-api-key",
      stockly: {
        prepare: vi.fn(),
      } as any,
      alertsKv: undefined,
    } as Env;
  });

  it("should run cron job successfully", async () => {
    // Mock FMP API response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          symbol: "AAPL",
          senator: "Nancy Pelosi",
          type: "Purchase",
          amount_range: "$15,001 - $50,000",
          disclosure_date: "2024-01-15",
          id: "fmp-123",
        },
      ],
    });

    // Mock database
    const mockDb: any = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        const stmt: any = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
        return stmt;
      }),
    };
    env.stockly = mockDb;

    await runSenateTradingCron(env);

    expect(global.fetch).toHaveBeenCalled();
  });

  it("should handle errors gracefully", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("API Error"));

    const mockDb: any = {
      prepare: vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      })),
    };
    env.stockly = mockDb;

    // Should not throw
    await expect(runSenateTradingCron(env)).resolves.not.toThrow();
  });
});


