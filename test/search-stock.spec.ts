import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchStock } from "../src/api/search-stock";
import { clearCache, setCache } from "../src/api/cache";
import { API_KEY, API_URL } from "../src/util";
import type { Env } from "../src/index";
import { createMockLogger } from "./test-utils";

const createUrl = (params: Record<string, string> = {}) => {
  const url = new URL("https://example.com/v1/api/search-stock");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
};

const createRequest = (params: Record<string, string> = {}) => {
  const url = createUrl(params);
  return new Request(url.toString());
};

const createEnv = (options?: {
  selectRow?: { results: string; timestamp: number } | null;
}) => {
  const selectFirst = vi.fn().mockResolvedValue(options?.selectRow ?? null);
  const insertRun = vi.fn().mockResolvedValue(undefined);
  let insertArgs: any[] | null = null;

  const prepare = vi.fn((query: string) => {
    if (query.includes("SELECT")) {
      return {
        bind: vi.fn().mockImplementation(() => ({
          first: selectFirst,
        })),
      };
    }

    if (query.includes("INSERT")) {
      return {
        bind: vi.fn().mockImplementation((...args: any[]) => {
          insertArgs = args;
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
    spies: { prepare, selectFirst, insertRun },
    getInsertArgs: () => insertArgs,
  };
};

describe("searchStock handler", () => {
  beforeEach(() => {
    clearCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns empty results when query is invalid", async () => {
    const { env } = createEnv();
    const url = createUrl({ query: "a" });
    const request = createRequest({ query: "a" });
    const response = await searchStock(request, url, env, createMockLogger());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("serves cached responses from memory", async () => {
    const cached = [{ symbol: "MSFT", name: "Microsoft" }];
    setCache("search:ms", cached, 60);
    const fetchSpy = vi.spyOn(globalThis as any, "fetch");

    const { env } = createEnv();
    const url = createUrl({ query: "MS" });
    const request = createRequest({ query: "MS" });
    const response = await searchStock(request, url, env, createMockLogger());

    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual(cached);
  });

  it("returns cached entries from D1 when still valid", async () => {
    const results = [{ symbol: "AAPL" }];
    const { env, spies } = createEnv({
      selectRow: { results: JSON.stringify(results), timestamp: 1704067200 },
    });
    const fetchSpy = vi.spyOn(globalThis as any, "fetch");

    const url = createUrl({ query: "AA" });
    const request = createRequest({ query: "AA" });
    const response = await searchStock(request, url, env, createMockLogger());

    expect(spies.selectFirst).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual(results);
  });

  it("invokes the upstream API, normalizes payload, and stores cache", async () => {
    const apiResponse = [
      {
        symbol: "AAPL",
        name: "Apple Inc",
        currency: "USD",
        stockExchange: "NASDAQ",
        extra: "ignored",
      },
    ];

    const json = vi.fn().mockResolvedValue(apiResponse);
    const fetchMock = vi
      .spyOn(globalThis as any, "fetch")
      .mockResolvedValue({ ok: true, json } as Response);

    const { env, spies, getInsertArgs } = createEnv({
      selectRow: null,
    });

    const url = createUrl({ query: "AA" });
    const request = createRequest({ query: "AA" });
    const response = await searchStock(request, url, env, createMockLogger());

    // The API now calls both search-name and search-symbol endpoints with limit=20
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/search-name?query=AA&limit=20&apikey=${API_KEY}`,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/search-symbol?query=AA&limit=20&apikey=${API_KEY}`,
    );
    expect(spies.insertRun).toHaveBeenCalled();
    const insertArgs = getInsertArgs();
    expect(insertArgs?.[0]).toBe("aa");
    expect(typeof insertArgs?.[1]).toBe("string");
    await expect(response.json()).resolves.toEqual([
      {
        symbol: "AAPL",
        name: "Apple Inc",
        currency: "USD",
        stockExchange: "NASDAQ",
      },
    ]);
  });

  it("ignores expired D1 cache entries and fetches fresh data", async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - (20 * 60 + 1);
    const { env, spies } = createEnv({
      selectRow: {
        results: JSON.stringify([{ symbol: "OLD" }]),
        timestamp: staleTimestamp,
      },
    });

    const json = vi.fn().mockResolvedValue([]);
    const fetchMock = vi
      .spyOn(globalThis as any, "fetch")
      .mockResolvedValue({ json } as Response);

    const url = createUrl({ query: "OL" });
    const request = createRequest({ query: "OL" });
    await searchStock(request, url, env, createMockLogger());

    expect(spies.selectFirst).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("returns empty array when upstream request fails gracefully", async () => {
    // Mock fetch to fail (return null) - the implementation catches this gracefully
    const { env } = createEnv({
      selectRow: null,
    });
    
    // Mock fetch to reject, which will be caught by .catch(() => null)
    vi.spyOn(globalThis as any, "fetch").mockRejectedValue(new Error("Network error"));

    const url = createUrl({ query: "MSFT" });
    const request = createRequest({ query: "MSFT" });
    const response = await searchStock(request, url, env, createMockLogger());

    // The API gracefully handles fetch failures by returning empty array (200)
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });
});
