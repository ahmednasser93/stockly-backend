/**
 * Tests for User Senator Follows Repository
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Env } from "../../../src/index";
import * as UserSenatorFollowsRepository from "../../src/repositories/user-senator-follows.repository";

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

describe("User Senator Follows Repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("followSenator", () => {
    it("should create a follow relationship", async () => {
      const { env, statements, prepare } = createEnv();

      prepare.mockImplementation((sql: string) => {
        const stmt = new MockStatement(sql);
        statements.push(stmt);
        if (sql.includes("INSERT INTO user_senator_follows")) {
          stmt.run.mockResolvedValue({ success: true, meta: { changes: 1 } });
        }
        return stmt as any;
      });

      await UserSenatorFollowsRepository.followSenator(
        env,
        "user-123",
        "testuser",
        "Nancy Pelosi",
        { alertOnPurchase: true, alertOnSale: true }
      );

      expect(prepare).toHaveBeenCalled();
      const insertStmt = statements.find((s) => s.sql.includes("INSERT INTO user_senator_follows"));
      expect(insertStmt).toBeDefined();
    });
  });

  describe("unfollowSenator", () => {
    it("should remove a follow relationship", async () => {
      const { env, statements, prepare } = createEnv();

      prepare.mockImplementation((sql: string) => {
        const stmt = new MockStatement(sql);
        statements.push(stmt);
        if (sql.includes("DELETE FROM user_senator_follows")) {
          stmt.run.mockResolvedValue({ success: true, meta: { changes: 1 } });
        }
        return stmt as any;
      });

      await UserSenatorFollowsRepository.unfollowSenator(env, "user-123", "Nancy Pelosi");

      expect(prepare).toHaveBeenCalled();
      const deleteStmt = statements.find((s) => s.sql.includes("DELETE FROM user_senator_follows"));
      expect(deleteStmt).toBeDefined();
    });
  });

  describe("getUserFollows", () => {
    it("should return user's followed senators", async () => {
      const { env, statements, prepare } = createEnv();
      const mockFollows = [
        {
          user_id: "user-123",
          username: "testuser",
          senator_name: "Nancy Pelosi",
          alert_on_purchase: 1,
          alert_on_sale: 1,
          created_at: "2024-01-15T10:00:00Z",
          updated_at: "2024-01-15T10:00:00Z",
        },
      ];

      prepare.mockImplementation((sql: string) => {
        const stmt = new MockStatement(sql);
        statements.push(stmt);
        if (sql.includes("WHERE user_id = ?")) {
          stmt.all.mockResolvedValue({ results: mockFollows });
        }
        return stmt as any;
      });

      const result = await UserSenatorFollowsRepository.getUserFollows(env, "user-123");

      expect(result).toHaveLength(1);
      expect(result[0].senatorName).toBe("Nancy Pelosi");
      expect(result[0].alertOnPurchase).toBe(true);
    });
  });

  describe("getFollowersOfSenator", () => {
    it("should return all users following a senator", async () => {
      const { env, statements, prepare } = createEnv();
      const mockFollows = [
        {
          user_id: "user-123",
          username: "testuser",
          senator_name: "Nancy Pelosi",
          alert_on_purchase: 1,
          alert_on_sale: 1,
          created_at: "2024-01-15T10:00:00Z",
          updated_at: "2024-01-15T10:00:00Z",
        },
      ];

      prepare.mockImplementation((sql: string) => {
        const stmt = new MockStatement(sql);
        statements.push(stmt);
        if (sql.includes("WHERE senator_name = ?")) {
          stmt.all.mockResolvedValue({ results: mockFollows });
        }
        return stmt as any;
      });

      const result = await UserSenatorFollowsRepository.getFollowersOfSenator(env, "Nancy Pelosi");

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("testuser");
    });
  });

  describe("updateFollowPreferences", () => {
    it("should update follow preferences", async () => {
      const { env, statements, prepare } = createEnv();

      prepare.mockImplementation((sql: string) => {
        const stmt = new MockStatement(sql);
        statements.push(stmt);
        if (sql.includes("UPDATE user_senator_follows")) {
          stmt.run.mockResolvedValue({ success: true, meta: { changes: 1 } });
        }
        return stmt as any;
      });

      await UserSenatorFollowsRepository.updateFollowPreferences(
        env,
        "user-123",
        "Nancy Pelosi",
        { alertOnPurchase: false }
      );

      expect(prepare).toHaveBeenCalled();
      const updateStmt = statements.find((s) => s.sql.includes("UPDATE user_senator_follows"));
      expect(updateStmt).toBeDefined();
    });
  });
});

