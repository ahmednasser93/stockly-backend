import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getStock } from "../src/api/get-stock";
import { API_KEY, API_URL } from "../src/util";
import { clearCache, setCache, getCache } from "../src/api/cache";
import type { Env } from "../src/index";

const createUrl = (params: Record<string, string> = {}) => {
  const url = new URL("https://example.com/v1/api/get-stock");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
};

const createEnv = (): Env => {
  const run = vi.fn().mockResolvedValue(undefined);
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return {
    stockly: { prepare } as any,
  };
};

describe("getStock handler", () => {
  beforeEach(() => {
    clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a symbol", async () => {
    const response = await getStock(createUrl(), createEnv());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "symbol required" });
  });

  it("returns cached data without calling the upstream API", async () => {
    const cached = { symbol: "MSFT", price: 100 };
    setCache("quote:MSFT", cached, 30);
    const fetchSpy = vi.spyOn(globalThis as any, "fetch");

    const response = await getStock(createUrl({ symbol: "msft" }), createEnv());

    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual(cached);
  });

  it("fetches the quote and caches the parsed response", async () => {
    const quote = { symbol: "AAPL", price: 195 };
    const json = vi.fn().mockResolvedValue([quote]);
    const fetchMock = vi
      .spyOn(globalThis as any, "fetch")
      .mockResolvedValue({ json } as Response);

    const response = await getStock(createUrl({ symbol: "AAPL" }), createEnv());

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/quote?symbol=AAPL&apikey=${API_KEY}`
    );
    await expect(response.json()).resolves.toEqual(quote);
    expect(getCache("quote:AAPL")).toEqual(quote);
  });

  it("returns an error when the upstream API fails", async () => {
    vi.spyOn(globalThis as any, "fetch").mockRejectedValue(new Error("fail"));

    const response = await getStock(createUrl({ symbol: "TSLA" }), createEnv());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "failed to fetch stock",
    });
  });
});
