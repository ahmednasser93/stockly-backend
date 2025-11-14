import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getStocks } from "../src/api/get-stocks";
import { clearCache, setCache } from "../src/api/cache";
import type { Env } from "../src/index";

const createUrl = (symbols: string | null) => {
  const url = new URL("https://example.com/v1/api/get-stocks");
  if (symbols !== null) {
    url.searchParams.set("symbols", symbols);
  }
  return url;
};

type DbRows = Record<string, any>;

const createEnv = (rows: DbRows = {}) => {
  const insertRun = vi.fn().mockResolvedValue(undefined);
  const prepare = vi.fn((query: string) => {
    if (query.includes("SELECT")) {
      return {
        bind: vi.fn().mockImplementation((symbol: string) => ({
          first: vi.fn().mockResolvedValue(rows[symbol] ?? null),
        })),
      };
    }

    if (query.includes("INSERT")) {
      return {
        bind: vi.fn().mockImplementation((...values: any[]) => {
          insertRun(values);
          return { run: insertRun };
        }),
      };
    }

    return {
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue(undefined),
      }),
    };
  });

  return {
    env: { stockly: { prepare } as any } as Env,
    spies: { prepare, insertRun },
  };
};

describe("getStocks handler", () => {
  beforeEach(() => {
    clearCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("requires symbols param", async () => {
    const { env } = createEnv();
    const response = await getStocks(createUrl(null), env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "symbols required" });
  });

  it("serves fresh entries from cache", async () => {
    const cached = { symbol: "AMZN", price: 1, timestamp: 1704067200 };
    setCache("quote:AMZN", cached, 30);
    const fetchSpy = vi.spyOn(globalThis as any, "fetch");
    const { env } = createEnv();

    const response = await getStocks(createUrl("amzn"), env);

    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual([cached]);
  });

  it("falls back to DB when cache misses", async () => {
    const { env } = createEnv({
      AAPL: {
        symbol: "AAPL",
        price: 10,
        day_low: 1,
        day_high: 11,
        volume: 100,
        timestamp: Math.floor(Date.now() / 1000),
      },
    });
    const fetchSpy = vi.spyOn(globalThis as any, "fetch");

    const response = await getStocks(createUrl("aapl"), env);

    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual([
      {
        symbol: "AAPL",
        price: 10,
        dayLow: 1,
        dayHigh: 11,
        volume: 100,
        timestamp: Math.floor(Date.now() / 1000),
      },
    ]);
  });

  it("fetches from API when cache and DB entries are stale", async () => {
    const staleTs = Math.floor(Date.now() / 1000) - 31;
    const { env, spies } = createEnv({
      TSLA: {
        symbol: "TSLA",
        price: 5,
        day_low: 4,
        day_high: 6,
        volume: 50,
        timestamp: staleTs,
      },
    });

    const quote = {
      symbol: "TSLA",
      price: 7,
      dayLow: 6,
      dayHigh: 8,
      volume: 80,
      timestamp: Math.floor(Date.now() / 1000),
    };
    const json = vi.fn().mockResolvedValue([quote]);
    vi.spyOn(globalThis as any, "fetch").mockResolvedValue({ ok: true, json } as Response);

    const response = await getStocks(createUrl("tsla"), env);

    expect(spies.insertRun).toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual([quote]);
  });

  it("returns 500 when API call fails", async () => {
    const { env } = createEnv();
    vi.spyOn(globalThis as any, "fetch").mockRejectedValue(new Error("boom"));

    const response = await getStocks(createUrl("msft"), env);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "failed to fetch stocks",
    });
  });
});
