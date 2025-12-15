import { describe, it, expect, beforeEach, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  createAlert,
  getAlert,
  listActiveAlerts,
  listAlerts,
  updateAlert,
  deleteAlert,
} from "../src/alerts/storage";
import {
  readAlertState,
  writeAlertState,
  deleteAlertState,
} from "../src/alerts/state";

class MockStatement {
  public args: unknown[] = [];
  public run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
  public first = vi.fn().mockResolvedValue(null);
  public all = vi.fn().mockResolvedValue({ results: [] });

  constructor(public sql: string) { }

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

describe("alerts storage queries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists alerts", async () => {
    const { env, statements, prepare } = createEnv();
    const rows = [
      {
        id: "1",
        symbol: "AAPL",
        direction: "above",
        threshold: 200,
        status: "active",
        channel: "notification",
        target: "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        notes: null,
        username: "testuser",
        created_at: "now",
        updated_at: "now",
      },
    ];
    prepare.mockImplementation((sql: string) => {
      const stmt = new MockStatement(sql);
      statements.push(stmt);
      stmt.all.mockResolvedValue({ results: rows });
      return stmt as any;
    });

    const alerts = await listAlerts(env, "testuser");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].symbol).toBe("AAPL");
    expect(alerts[0].username).toBe("testuser");
  });

  it("creates and returns an alert", async () => {
    const { env, statements, prepare } = createEnv();
    const createdRow = {
      id: "generated-id",
      symbol: "AAPL",
      direction: "above",
      threshold: 200,
      status: "active",
      channel: "notification",
      target: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
      notes: null,
      username: "testuser",
      created_at: "now",
      updated_at: "now",
    };
    let selectCalls = 0;
    prepare.mockImplementation((sql: string) => {
      const stmt = new MockStatement(sql);
      statements.push(stmt);
      if (sql.includes("INSERT INTO alerts")) {
        stmt.run.mockResolvedValue({ success: true, meta: { changes: 1 } });
      }
      if (sql.includes("WHERE id = ?")) {
        stmt.first.mockImplementation(async () => {
          selectCalls += 1;
          return selectCalls ? createdRow : null;
        });
      }
      return stmt as any;
    });

    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("generated-id");
    const alert = await createAlert(env, {
      symbol: "AAPL",
      direction: "above",
      threshold: 200,
      channel: "notification",
      target: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    }, "testuser");

    expect(alert.id).toBe("generated-id");
    const insert = statements.find((stmt) => stmt.sql.includes("INSERT INTO alerts"));
    expect(insert?.args[0]).toBe("generated-id");
  });

  it("throws validation error for invalid data", async () => {
    const { env, prepare } = createEnv();
    prepare.mockImplementation((sql) => {
      const stmt = new MockStatement(sql);
      stmt.run.mockRejectedValue(new Error("CHECK constraint failed: threshold > 0"));
      return stmt as any;
    });

    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("id");
    await expect(createAlert(env, {
      symbol: "BAD",
      direction: "above",
      threshold: -1,
      channel: "notification",
      target: "t"
    }, "u")).rejects.toThrow("Invalid alert data");
  });

  it("throws missing data error", async () => {
    const { env, prepare } = createEnv();
    prepare.mockImplementation((sql) => {
      const stmt = new MockStatement(sql);
      stmt.run.mockRejectedValue(new Error("NOT NULL constraint failed: alerts.symbol"));
      return stmt as any;
    });

    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("id");
    await expect(createAlert(env, {
      symbol: "", // invalid
      direction: "above",
      threshold: 10,
      channel: "notification",
      target: "t"
    }, "u")).rejects.toThrow("Missing required alert data");
  });

  it("throws if alert creation cannot be verified", async () => {
    const { env, prepare } = createEnv();
    prepare.mockImplementation((sql) => {
      const stmt = new MockStatement(sql);
      if (sql.includes("INSERT")) {
        stmt.run.mockResolvedValue({ success: true, meta: { changes: 1 } });
      }
      if (sql.includes("SELECT")) {
        stmt.first.mockResolvedValue(null); // Return nothing
      }
      return stmt as any;
    });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("id");

    await expect(createAlert(env, {
      symbol: "A", direction: "above", threshold: 1, channel: "notification", target: "t"
    }, "u")).rejects.toThrow("failed to load created alert");
  });

  it("throws if created alert has mismatched username", async () => {
    const { env, prepare } = createEnv();
    prepare.mockImplementation((sql) => {
      const stmt = new MockStatement(sql);
      if (sql.includes("INSERT")) {
        stmt.run.mockResolvedValue({ success: true, meta: { changes: 1 } });
      }
      if (sql.includes("SELECT")) {
        // Return mismatch username
        stmt.first.mockResolvedValue({
          id: "id", symbol: "A", username: "other", direction: "above",
          threshold: 1, status: "active", channel: "notification",
          target: "t", created_at: "now", updated_at: "now"
        });
      }
      return stmt as any;
    });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("id");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => { });

    await expect(createAlert(env, {
      symbol: "A", direction: "above", threshold: 1, channel: "notification", target: "t"
    }, "me")).rejects.toThrow("incorrect username");

    consoleSpy.mockRestore();
  });

  it("updates alerts with provided fields", async () => {
    const { env, statements, prepare } = createEnv();
    const updatedRow = {
      id: "1",
      symbol: "MSFT",
      direction: "below",
      threshold: 150,
      status: "paused",
      channel: "notification",
      target: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
      notes: "",
      username: "testuser",
      created_at: "now",
      updated_at: "later",
    };
    prepare.mockImplementation((sql: string) => {
      const stmt = new MockStatement(sql);
      statements.push(stmt);
      if (sql.startsWith("UPDATE alerts")) {
        stmt.run.mockResolvedValue({ success: true, meta: { changes: 1 } });
      }
      if (sql.includes("WHERE id = ?")) {
        stmt.first.mockResolvedValue(updatedRow);
      }
      return stmt as any;
    });

    // Case 1: Early return if no fields
    const noOp = await updateAlert(env, "1", {}, "testuser");
    // Should fetch and return existing (mocked above)
    expect(noOp).toEqual({
      ...updatedRow,
      createdAt: updatedRow.created_at,
      updatedAt: updatedRow.updated_at,
      created_at: undefined,
      updated_at: undefined
    });

    const result = await updateAlert(env, "1", {
      symbol: "MSFT",
      status: "paused",
    }, "testuser");

    expect(result?.symbol).toBe("MSFT");
    const updateStmt = statements.find((stmt) => stmt.sql.startsWith("UPDATE alerts"));
    expect(updateStmt?.sql).toContain("symbol = ?");

    // Case 2: Validation error during update
    prepare.mockImplementation((sql) => {
      const stmt = new MockStatement(sql);
      if (sql.includes("UPDATE")) {
        stmt.run.mockRejectedValue(new Error("CHECK constraint failed"));
      }
      return stmt as any;
    });

    await expect(updateAlert(env, "1", { threshold: -5 }, "testuser"))
      .rejects.toThrow("Invalid alert data");
  });

  it("deletes alerts", async () => {
    const { env, prepare } = createEnv();
    prepare.mockImplementation((sql: string) => {
      const stmt = new MockStatement(sql);
      if (sql.startsWith("DELETE FROM alerts")) {
        stmt.run.mockResolvedValue({ success: true, meta: { changes: 1 } });
      }
      return stmt as any;
    });
    const deleted = await deleteAlert(env, "1", "testuser");
    expect(deleted).toBe(true);
  });

  it("lists active alerts", async () => {
    const { env, prepare } = createEnv();
    const rows = [
      {
        id: "1",
        symbol: "AAPL",
        direction: "above",
        threshold: 200,
        status: "active",
        channel: "notification",
        target: "dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        notes: null,
        username: "testuser",
        created_at: "now",
        updated_at: "now",
      },
    ];
    prepare.mockImplementation((sql: string) => {
      const stmt = new MockStatement(sql);
      if (sql.includes("status = ?")) {
        stmt.all.mockResolvedValue({ results: rows });
      }
      return stmt as any;
    });
    const active = await listActiveAlerts(env);
    expect(active).toHaveLength(1);
  });

  it("lists all alerts for admin (null username)", async () => {
    const { env, statements, prepare } = createEnv();
    const rows = [
      {
        id: "1",
        symbol: "AAPL",
        direction: "above",
        threshold: 200,
        status: "active",
        channel: "notification",
        target: "token1",
        notes: null,
        username: "user1",
        created_at: "now",
        updated_at: "now",
      },
      {
        id: "2",
        symbol: "MSFT",
        direction: "below",
        threshold: 100,
        status: "active",
        channel: "notification",
        target: "token2",
        notes: null,
        username: "user2",
        created_at: "now",
        updated_at: "now",
      },
    ];

    prepare.mockImplementation((sql: string) => {
      const stmt = new MockStatement(sql);
      statements.push(stmt);
      // Admin query should NOT filter by username
      if (!sql.includes("WHERE username = ?")) {
        stmt.all.mockResolvedValue({ results: rows });
      }
      return stmt as any;
    });

    const alerts = await listAlerts(env, null);
    expect(alerts).toHaveLength(2);

    // Verify executed SQL does not contain username filter
    const listStmt = statements.find(s => s.sql.includes("SELECT id, symbol"));
    expect(listStmt).toBeDefined();
    expect(listStmt?.sql).not.toContain("WHERE username = ?");
  });

  it("throws specific error on unique constraint violation", async () => {
    const { env, prepare } = createEnv();
    prepare.mockImplementation((sql) => {
      const stmt = new MockStatement(sql);
      if (sql.includes("INSERT INTO alerts")) {
        stmt.run.mockRejectedValue(new Error("UNIQUE constraint failed: alerts.symbol"));
      }
      return stmt as any;
    });

    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("gen-id");

    await expect(createAlert(env, {
      symbol: "AAPL",
      direction: "above",
      threshold: 200,
      channel: "notification",
      target: "token",
    }, "testuser")).rejects.toThrow("An alert already exists for this symbol and threshold");
  });
  it("lists active alerts for specific user", async () => {
    const { env, prepare } = createEnv();
    const rows = [{ id: "1", symbol: "AAPL", status: "active", username: "testuser" }];

    prepare.mockImplementation((sql: string) => {
      const stmt = new MockStatement(sql);
      if (sql.includes("username = ?")) {
        stmt.all.mockResolvedValue({ results: rows });
      }
      return stmt as any;
    });

    const active = await listActiveAlerts(env, "testuser");
    expect(active).toHaveLength(1);
    expect(active[0].username).toBe("testuser");
  });

  it("admin updates alert (null username)", async () => {
    const { env, statements, prepare } = createEnv();
    prepare.mockImplementation((sql: string) => {
      const stmt = new MockStatement(sql);
      statements.push(stmt);
      if (sql.startsWith("UPDATE alerts")) {
        stmt.run.mockResolvedValue({ success: true, meta: { changes: 1 } });
      }
      if (sql.includes("WHERE id = ?")) {
        stmt.first.mockResolvedValue({ id: "1", symbol: "UPDATED" });
      }
      return stmt as any;
    });

    await updateAlert(env, "1", { symbol: "UPDATED" }, null);

    const updateStmt = statements.find(s => s.sql.startsWith("UPDATE"));
    expect(updateStmt).toBeDefined();
    expect(updateStmt?.sql).not.toContain("username = ?");
  });

  it("admin deletes alert (null username)", async () => {
    const { env, statements, prepare } = createEnv();
    prepare.mockImplementation((sql: string) => {
      const stmt = new MockStatement(sql);
      statements.push(stmt);
      if (sql.startsWith("DELETE FROM alerts")) {
        stmt.run.mockResolvedValue({ success: true, meta: { changes: 1 } });
      }
      return stmt as any;
    });

    await deleteAlert(env, "1", null);

    const deleteStmt = statements.find(s => s.sql.startsWith("DELETE"));
    expect(deleteStmt).toBeDefined();
    expect(deleteStmt?.sql).not.toContain("username = ?");
  });

  it("updates all alert fields", async () => {
    const { env, statements, prepare } = createEnv();
    prepare.mockImplementation((sql: string) => {
      const stmt = new MockStatement(sql);
      statements.push(stmt);
      return stmt as any;
    });

    await updateAlert(env, "1", {
      symbol: "TEST",
      direction: "above",
      threshold: 100,
      status: "active",
      channel: "webhook",
      target: "url",
      notes: "note"
    }, "user");

    const updateStmt = statements.find(s => s.sql.startsWith("UPDATE"));
    expect(updateStmt?.sql).toContain("symbol = ?");
    expect(updateStmt?.sql).toContain("direction = ?");
    expect(updateStmt?.sql).toContain("threshold = ?");
    expect(updateStmt?.sql).toContain("status = ?");
    expect(updateStmt?.sql).toContain("channel = ?");
    expect(updateStmt?.sql).toContain("target = ?");
    expect(updateStmt?.sql).toContain("notes = ?");
  });
});

describe("alerts state KV", () => {
  const createKv = () => {
    const store = new Map<string, string>();
    return {
      store,
      kv: {
        get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        put: vi.fn((key: string, value: string) => {
          store.set(key, value);
          return Promise.resolve();
        }),
        delete: vi.fn((key: string) => {
          store.delete(key);
          return Promise.resolve();
        }),
      },
    };
  };

  it("reads and writes state snapshots", async () => {
    const { kv } = createKv();
    await writeAlertState(kv as any, "1", { lastConditionMet: true, lastPrice: 100 });
    const stored = await readAlertState(kv as any, "1");
    expect(stored?.lastConditionMet).toBe(true);
  });

  it("reads state from KV when cache misses", async () => {
    const { kv, store } = createKv();
    const stateObj = { lastConditionMet: true, lastPrice: 50 };
    store.set("alert:kv:state", JSON.stringify(stateObj));

    const state = await readAlertState(kv as any, "kv");
    expect(state).toEqual(stateObj);
  });

  it("deletes state", async () => {
    const { kv } = createKv();
    await writeAlertState(kv as any, "1", { lastConditionMet: true });
    await deleteAlertState(kv as any, "1");
    const stored = await readAlertState(kv as any, "1");
    expect(stored).toBeNull();
  });

  it("handles JSON parse errors in state gracefully", async () => {
    const { kv, store } = createKv();
    store.set("alert:bad:state", "{ invalid json");

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
    const state = await readAlertState(kv as any, "bad");

    expect(state).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith("failed to parse alert state", expect.anything());
    consoleSpy.mockRestore();
  });
});
if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}
