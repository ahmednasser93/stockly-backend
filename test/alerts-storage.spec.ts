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

    const alerts = await listAlerts(env);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].symbol).toBe("AAPL");
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
    });

    expect(alert.id).toBe("generated-id");
    const insert = statements.find((stmt) => stmt.sql.includes("INSERT INTO alerts"));
    expect(insert?.args[0]).toBe("generated-id");
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

    const result = await updateAlert(env, "1", {
      symbol: "MSFT",
      status: "paused",
    });

    expect(result?.symbol).toBe("MSFT");
    const updateStmt = statements.find((stmt) => stmt.sql.startsWith("UPDATE alerts"));
    expect(updateStmt?.sql).toContain("symbol = ?");
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
    const deleted = await deleteAlert(env, "1");
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

  it("deletes state", async () => {
    const { kv } = createKv();
    await writeAlertState(kv as any, "1", { lastConditionMet: true });
    await deleteAlertState(kv as any, "1");
    const stored = await readAlertState(kv as any, "1");
    expect(stored).toBeNull();
  });
});
if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}
