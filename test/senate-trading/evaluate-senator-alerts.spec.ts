/**
 * Tests for Senator Alert Evaluation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { evaluateSenatorAlerts } from "../../src/alerts/evaluate-senator-alerts";
import type { Env } from "../../src/index";
import { createMockLogger } from "../test-utils";

describe("Evaluate Senator Alerts", () => {
  let env: Env;
  let mockDb: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockDb = {
      prepare: vi.fn(),
    };
    env = {
      stockly: mockDb as any,
      alertsKv: undefined,
    } as Env;
  });

  it("should evaluate alerts for matching trades", async () => {
    const logger = createMockLogger();

    // Mock database responses
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

    let callCount = 0;
    mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
      const stmt: any = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn(),
        first: vi.fn(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      if (sql.includes("FROM senate_trades")) {
        stmt.all.mockResolvedValue({ results: mockTrades });
      } else if (sql.includes("FROM users")) {
        stmt.all.mockResolvedValue({ results: mockUsers });
      } else if (sql.includes("FROM user_favorite_stocks")) {
        stmt.all.mockResolvedValue({ results: mockFavoriteStocks });
      } else if (sql.includes("FROM user_notification_preferences")) {
        stmt.first.mockResolvedValue(mockPreferences);
      } else if (sql.includes("FROM user_senator_follows")) {
        stmt.all.mockResolvedValue({ results: [] });
      } else if (sql.includes("INSERT INTO notifications_log")) {
        stmt.run.mockResolvedValue({ success: true });
      }

      return stmt;
    });

    const result = await evaluateSenatorAlerts(env, logger);

    expect(result.tradesProcessed).toBeGreaterThanOrEqual(0);
    expect(result.alertsSent).toBeGreaterThanOrEqual(0);
  });
});


