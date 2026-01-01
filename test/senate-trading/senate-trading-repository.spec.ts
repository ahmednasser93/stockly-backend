/**
 * Tests for Senate Trading Repository
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Env } from "../../src/index";
import * as SenateTradingRepository from "../../src/repositories/senate-trading.repository";
import type { SenateTradeRecord } from "../../src/senate-trading/types";

class MockStatement {
  public args: unknown[] = [];
  public run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
  public first = vi.fn().mockResolvedValue(null);
  public all = vi.fn().mockResolvedValue({ results: [] });

  constructor(public sql: string) {}

  bind(...args: unknown[]) {
    this.args = args;
    return this;
  }
}

const createEnv = () => {
  const statements: MockStatement[] = [];
  const prepare = vi.fn((sql: string) => {
    const statement = new MockStatement(sql);
    statements.push(statement);
    return statement as any;
  });
  return { env: { stockly: { prepare } } as any, statements, prepare };
};

describe("Senate Trading Repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("upsertTrade", () => {
    it("should insert a new trade when fmp_id doesn't exist", async () => {
      const { env, statements, prepare } = createEnv();
      const trade: SenateTradeRecord = {
        id: "test-id",
        symbol: "AAPL",
        senatorName: "Test Senator",
        transactionType: "Purchase",
        amountRangeMin: 15000,
        amountRangeMax: 50000,
        disclosureDate: "2024-01-15",
        transactionDate: "2024-01-10",
        fmpId: "fmp-123",
        createdAt: "2024-01-15T10:00:00Z",
        updatedAt: "2024-01-15T10:00:00Z",
      };

      // Mock getTradeByFmpId to return null (trade doesn't exist)
      prepare.mockImplementation((sql: string) => {
        const stmt = new MockStatement(sql);
        statements.push(stmt);
        if (sql.includes("WHERE fmp_id = ?")) {
          stmt.first.mockResolvedValue(null);
        } else if (sql.includes("INSERT INTO senate_trades")) {
          stmt.run.mockResolvedValue({ success: true, meta: { changes: 1 } });
        }
        return stmt as any;
      });

      await SenateTradingRepository.upsertTrade(env, trade);

      expect(prepare).toHaveBeenCalled();
      const insertStmt = statements.find((s) => s.sql.includes("INSERT INTO senate_trades"));
      expect(insertStmt).toBeDefined();
    });

    it("should update existing trade when fmp_id exists", async () => {
      const { env, statements, prepare } = createEnv();
      const trade: SenateTradeRecord = {
        id: "test-id",
        symbol: "AAPL",
        senatorName: "Test Senator",
        transactionType: "Purchase",
        amountRangeMin: 15000,
        amountRangeMax: 50000,
        disclosureDate: "2024-01-15",
        transactionDate: "2024-01-10",
        fmpId: "fmp-123",
        createdAt: "2024-01-15T10:00:00Z",
        updatedAt: "2024-01-15T10:00:00Z",
      };

      const existingTrade = {
        id: "existing-id",
        symbol: "AAPL",
        senator_name: "Test Senator",
        transaction_type: "Purchase",
        amount_range_min: 15000,
        amount_range_max: 50000,
        disclosure_date: "2024-01-15",
        transaction_date: "2024-01-10",
        fmp_id: "fmp-123",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
      };

      prepare.mockImplementation((sql: string) => {
        const stmt = new MockStatement(sql);
        statements.push(stmt);
        if (sql.includes("WHERE fmp_id = ?")) {
          stmt.first.mockResolvedValue(existingTrade);
        } else if (sql.includes("UPDATE senate_trades")) {
          stmt.run.mockResolvedValue({ success: true, meta: { changes: 1 } });
        }
        return stmt as any;
      });

      await SenateTradingRepository.upsertTrade(env, trade);

      expect(prepare).toHaveBeenCalled();
      const updateStmt = statements.find((s) => s.sql.includes("UPDATE senate_trades"));
      expect(updateStmt).toBeDefined();
    });
  });

  describe("getTradesBySymbol", () => {
    it("should return trades for a symbol", async () => {
      const { env, statements, prepare } = createEnv();
      const mockTrades = [
        {
          id: "1",
          symbol: "AAPL",
          senator_name: "Test Senator",
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

      prepare.mockImplementation((sql: string) => {
        const stmt = new MockStatement(sql);
        statements.push(stmt);
        if (sql.includes("WHERE symbol = ?")) {
          stmt.all.mockResolvedValue({ results: mockTrades });
        }
        return stmt as any;
      });

      const result = await SenateTradingRepository.getTradesBySymbol(env, "AAPL", 10);

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe("AAPL");
      expect(prepare).toHaveBeenCalled();
    });
  });

  describe("getRecentTrades", () => {
    it("should return recent trades", async () => {
      const { env, statements, prepare } = createEnv();
      const mockTrades = [
        {
          id: "1",
          symbol: "AAPL",
          senator_name: "Test Senator",
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

      prepare.mockImplementation((sql: string) => {
        const stmt = new MockStatement(sql);
        statements.push(stmt);
        if (sql.includes("ORDER BY disclosure_date DESC")) {
          stmt.all.mockResolvedValue({ results: mockTrades });
        }
        return stmt as any;
      });

      const result = await SenateTradingRepository.getRecentTrades(env, 10);

      expect(result).toHaveLength(1);
      expect(prepare).toHaveBeenCalled();
    });
  });

  describe("getAllSenators", () => {
    it("should return unique senator names", async () => {
      const { env, statements, prepare } = createEnv();
      const mockSenators = [
        { senator_name: "Senator A" },
        { senator_name: "Senator B" },
      ];

      prepare.mockImplementation((sql: string) => {
        const stmt = new MockStatement(sql);
        statements.push(stmt);
        if (sql.includes("DISTINCT senator_name")) {
          stmt.all.mockResolvedValue({ results: mockSenators });
        }
        return stmt as any;
      });

      const result = await SenateTradingRepository.getAllSenators(env);

      expect(result).toHaveLength(2);
      expect(result).toContain("Senator A");
      expect(result).toContain("Senator B");
    });
  });
});

