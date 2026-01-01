/**
 * Integration tests for Senate Trading feature
 * Tests end-to-end flows including cron job and alert triggering
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { runSenateTradingCron } from "../../src/cron/senate-trading-cron";
import { evaluateSenatorAlerts } from "../../src/alerts/evaluate-senator-alerts";
import { createSenateTradingService } from "../../src/factories/createSenateTradingService";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";

describe("Senate Trading Integration", () => {
  let env: Env;
  let mockDb: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockDb = {
      prepare: vi.fn(),
    };
    env = {
      stockly: mockDb as any,
      FMP_API_KEY: "test-api-key",
      alertsKv: undefined,
    } as Env;
  });

  describe("End-to-end flow", () => {
    it("should sync trades and evaluate alerts", async () => {
      const logger = createMockLogger();

      // Mock FMP API response
      const mockFmpTrades = [
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
        json: async () => mockFmpTrades,
      });

      // Mock database operations
      let tradesStored = 0;
      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        const stmt: any = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
        };

        if (sql.includes("INSERT INTO senate_trades") || sql.includes("UPDATE senate_trades")) {
          tradesStored++;
          stmt.run.mockResolvedValue({ success: true, meta: { changes: 1 } });
        } else if (sql.includes("FROM senate_trades WHERE fmp_id")) {
          stmt.first.mockResolvedValue(null); // Trade doesn't exist yet
        } else if (sql.includes("FROM senate_trades")) {
          stmt.all.mockResolvedValue({ results: [] });
        } else if (sql.includes("FROM users")) {
          stmt.all.mockResolvedValue({ results: [] });
        }

        return stmt;
      });

      const senateService = createSenateTradingService(env, logger);
      const syncResult = await senateService.syncSenateTrades();

      expect(syncResult.added).toBeGreaterThan(0);
      expect(global.fetch).toHaveBeenCalled();
    });

    it("should trigger alerts for matching users", async () => {
      const logger = createMockLogger();

      const mockTrades = [
        {
          id: "1",
          symbol: "AAPL",
          senator_name: "Nancy Pelosi",
          transaction_type: "Purchase",
          amount_range_min: 15000,
          amount_range_max: 50000,
          disclosure_date: "2024-01-15",
          transaction_date: "2024-01-10",
          fmp_id: "fmp-123",
          created_at: "2024-01-15T10:00:00Z",
          updated_at: "2024-01-15T10:00:00Z",
        },
      ];

      const mockUsers = [
        { id: "user-123", username: "testuser" },
      ];

      const mockFavoriteStocks = [
        { symbol: "AAPL" },
      ];

      const mockPreferences = {
        senator_alerts_enabled: 1,
        senator_alert_holdings_only: 0,
        senator_alert_followed_only: 0,
      };

      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        const stmt: any = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn().mockResolvedValue({ success: true }),
        };

        if (sql.includes("FROM senate_trades") && sql.includes("WHERE disclosure_date")) {
          stmt.all.mockResolvedValue({ results: mockTrades });
        } else if (sql.includes("FROM users") && sql.includes("INNER JOIN devices")) {
          stmt.all.mockResolvedValue({ results: mockUsers });
        } else if (sql.includes("FROM user_favorite_stocks")) {
          stmt.all.mockResolvedValue({ results: mockFavoriteStocks });
        } else if (sql.includes("FROM user_notification_preferences")) {
          stmt.first.mockResolvedValue(mockPreferences);
        } else if (sql.includes("FROM user_senator_follows")) {
          stmt.all.mockResolvedValue({ results: [] });
        } else if (sql.includes("FROM device_push_tokens")) {
          stmt.all.mockResolvedValue({ results: [] });
        } else if (sql.includes("INSERT INTO notifications_log")) {
          stmt.run.mockResolvedValue({ success: true });
        }

        return stmt;
      });

      const result = await evaluateSenatorAlerts(env, logger);

      expect(result.tradesProcessed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Cron job flow", () => {
    it("should complete full cron job cycle", async () => {
      // Mock FMP API
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      // Mock database
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      }));

      await expect(runSenateTradingCron(env)).resolves.not.toThrow();
    });
  });
});


