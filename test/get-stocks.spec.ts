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

  it("refreshes from API when cache misses to get full data", async () => {
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
    
    const quoteData = {
      symbol: "AAPL",
      name: "Apple Inc.",
      price: 10,
      dayLow: 1,
      dayHigh: 11,
      volume: 100,
    };
    
    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      if (url.includes("/quote?")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([quoteData]),
        } as Response);
      }
      if (url.includes("/profile?")) {
        return Promise.resolve({ ok: false, status: 404 } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });

    const response = await getStocks(createUrl("aapl"), env);
    const data = await response.json();

    // We refresh to get full data (image, name, description, etc.)
    expect(data.length).toBe(1);
    expect(data[0].symbol).toBe("AAPL");
    expect(data[0].price).toBe(10);
    expect(data[0].image).toBeDefined();
    expect(data[0].name).toBeDefined();
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
    
    let fetchCallCount = 0;
    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      fetchCallCount++;
      if (url.includes("/quote?")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([quote]),
        } as Response);
      }
      // Profile fetch returns default image
      if (url.includes("/profile?")) {
        return Promise.resolve({ ok: false, status: 404 } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });

    const response = await getStocks(createUrl("tsla"), env);
    const data = await response.json();

    expect(spies.insertRun).toHaveBeenCalled();
    expect(data.length).toBe(1);
    expect(data[0].symbol).toBe("TSLA");
    expect(data[0].price).toBe(7);
    expect(data[0].image).toBeDefined();
    expect(data[0].name).toBeDefined();
  });

  it("returns empty array when all API calls fail", async () => {
    const { env } = createEnv();
    vi.spyOn(globalThis as any, "fetch").mockRejectedValue(new Error("boom"));

    const response = await getStocks(createUrl("msft"), env);

    // Promise.allSettled handles failures gracefully, returns empty array
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it("returns full data structure with all required fields for single stock", async () => {
    const { env } = createEnv();
    
    const quoteData = {
      symbol: "AAPL",
      name: "Apple Inc.",
      price: 195.50,
      change: 2.50,
      changePercent: 1.30,
      dayLow: 193.00,
      dayHigh: 196.00,
      volume: 50000000,
    };
    
    const profileData = {
      symbol: "AAPL",
      companyName: "Apple Inc.",
      image: "https://images.financialmodelingprep.com/symbol/AAPL.png",
      description: "Apple Inc. designs, manufactures, and markets smartphones.",
    };

    let fetchCallCount = 0;
    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      fetchCallCount++;
      if (url.includes("/quote?")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([quoteData]),
        } as Response);
      }
      if (url.includes("/profile?")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([profileData]),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });

    const response = await getStocks(createUrl("AAPL"), env);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    
    const stock = data[0];
    expect(stock.symbol).toBe("AAPL");
    expect(stock.name).toBe("Apple Inc.");
    expect(stock.price).toBe(195.50);
    expect(stock.change).toBe(2.50);
    expect(stock.changePercent || stock.changePercentage).toBeDefined();
    expect(stock.image).toBe("https://images.financialmodelingprep.com/symbol/AAPL.png");
    expect(stock.description).toBe("Apple Inc. designs, manufactures, and markets smartphones.");
  });

  it("returns full data structure for multiple stocks", async () => {
    const { env } = createEnv();
    
    const quotes = [
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        price: 195.50,
        change: 2.50,
        changePercent: 1.30,
      },
      {
        symbol: "MSFT",
        name: "Microsoft Corporation",
        price: 420.75,
        change: -5.25,
        changePercent: -1.23,
      },
    ];
    
    const profiles = [
      {
        symbol: "AAPL",
        image: "https://images.financialmodelingprep.com/symbol/AAPL.png",
        description: "Apple Inc. description",
      },
      {
        symbol: "MSFT",
        image: "https://images.financialmodelingprep.com/symbol/MSFT.png",
        description: "Microsoft Corporation description",
      },
    ];

    let fetchCallCount = 0;
    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      fetchCallCount++;
      if (url.includes("/quote?symbol=AAPL")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([quotes[0]]),
        } as Response);
      }
      if (url.includes("/quote?symbol=MSFT")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([quotes[1]]),
        } as Response);
      }
      if (url.includes("/profile?symbol=AAPL")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([profiles[0]]),
        } as Response);
      }
      if (url.includes("/profile?symbol=MSFT")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([profiles[1]]),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });

    const response = await getStocks(createUrl("AAPL,MSFT"), env);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    
    // Verify AAPL
    const aapl = data.find((s: any) => s.symbol === "AAPL");
    expect(aapl).toBeDefined();
    expect(aapl?.symbol).toBe("AAPL");
    expect(aapl?.name).toBe("Apple Inc.");
    expect(aapl?.price).toBe(195.50);
    expect(aapl?.change).toBe(2.50);
    expect(aapl?.changePercent || aapl?.changePercentage).toBeDefined();
    expect(aapl?.image).toBe("https://images.financialmodelingprep.com/symbol/AAPL.png");
    expect(aapl?.description).toBe("Apple Inc. description");
    
    // Verify MSFT
    const msft = data.find((s: any) => s.symbol === "MSFT");
    expect(msft).toBeDefined();
    expect(msft?.symbol).toBe("MSFT");
    expect(msft?.name).toBe("Microsoft Corporation");
    expect(msft?.price).toBe(420.75);
    expect(msft?.change).toBe(-5.25);
    expect(msft?.changePercent || msft?.changePercentage).toBeDefined();
    expect(msft?.image).toBe("https://images.financialmodelingprep.com/symbol/MSFT.png");
    expect(msft?.description).toBe("Microsoft Corporation description");
  });

  it("sets name from companyName if name is missing", async () => {
    const { env } = createEnv();
    
    const quoteData = {
      symbol: "TSLA",
      companyName: "Tesla, Inc.",
      price: 250.00,
      change: 5.00,
      changePercent: 2.04,
    };
    
    const profileData = {
      symbol: "TSLA",
      companyName: "Tesla, Inc.",
      image: "https://images.financialmodelingprep.com/symbol/TSLA.png",
    };

    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      if (url.includes("/quote?")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([quoteData]),
        } as Response);
      }
      if (url.includes("/profile?")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([profileData]),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });

    const response = await getStocks(createUrl("TSLA"), env);
    const data = await response.json();

    expect(data[0].name).toBe("Tesla, Inc.");
    expect(data[0].symbol).toBe("TSLA");
  });

  it("always includes image even if profile fetch fails", async () => {
    const { env } = createEnv();
    
    const quoteData = {
      symbol: "GOOGL",
      name: "Alphabet Inc.",
      price: 150.00,
      change: 1.50,
      changePercent: 1.01,
    };

    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      if (url.includes("/quote?")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([quoteData]),
        } as Response);
      }
      // Profile fetch fails
      if (url.includes("/profile?")) {
        return Promise.resolve({ ok: false, status: 404 } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });

    const response = await getStocks(createUrl("GOOGL"), env);
    const data = await response.json();

    expect(data[0].image).toBe("https://images.financialmodelingprep.com/symbol/GOOGL.png");
    expect(data[0].symbol).toBe("GOOGL");
    expect(data[0].name).toBe("Alphabet Inc.");
  });

  it("handles partial failures gracefully with Promise.allSettled", async () => {
    const { env } = createEnv();
    
    const aaplQuote = {
      symbol: "AAPL",
      name: "Apple Inc.",
      price: 195.50,
      change: 2.50,
      changePercent: 1.30,
    };
    
    const aaplProfile = {
      symbol: "AAPL",
      image: "https://images.financialmodelingprep.com/symbol/AAPL.png",
    };

    let fetchCallCount = 0;
    vi.spyOn(globalThis as any, "fetch").mockImplementation((url: string) => {
      fetchCallCount++;
      if (url.includes("/quote?symbol=AAPL")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([aaplQuote]),
        } as Response);
      }
      if (url.includes("/quote?symbol=INVALID")) {
        return Promise.resolve({ ok: false, status: 404 } as Response);
      }
      if (url.includes("/profile?symbol=AAPL")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([aaplProfile]),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });

    const response = await getStocks(createUrl("AAPL,INVALID"), env);
    const data = await response.json();

    // Should return only AAPL, not INVALID
    expect(data.length).toBe(1);
    expect(data[0].symbol).toBe("AAPL");
    expect(data[0].name).toBe("Apple Inc.");
    expect(data[0].price).toBe(195.50);
    expect(data[0].image).toBeDefined();
  });
});
