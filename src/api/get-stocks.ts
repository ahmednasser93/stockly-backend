import { API_KEY, API_URL, json } from "../util";
import type { Env } from "../index";
import { getCacheEntry, setCache } from "./cache";

const CACHE_TTL_SECONDS = 30;

type QuoteRecord = {
  symbol: string;
  price: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  volume: number | null;
  timestamp: number;
};

type DbRow = {
  symbol: string;
  price: number | null;
  day_low: number | null;
  day_high: number | null;
  volume: number | null;
  timestamp: number;
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

const isFresh = (timestamp?: number | null) => {
  if (!timestamp) return false;
  return nowSeconds() - timestamp <= CACHE_TTL_SECONDS;
};

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

function mapDbRow(row: DbRow): QuoteRecord {
  return {
    symbol: row.symbol,
    price: row.price,
    dayLow: row.day_low,
    dayHigh: row.day_high,
    volume: row.volume,
    timestamp: row.timestamp,
  };
}

function mapQuotePayload(symbol: string, payload: any): QuoteRecord {
  return {
    symbol: payload.symbol ?? symbol,
    price: payload.price ?? null,
    dayLow: payload.dayLow ?? payload.day_low ?? null,
    dayHigh: payload.dayHigh ?? payload.day_high ?? null,
    volume: payload.volume ?? null,
    timestamp:
      typeof payload.timestamp === "number" ? payload.timestamp : nowSeconds(),
  };
}

async function getLatestFromDb(
  env: Env,
  symbol: string
): Promise<QuoteRecord | null> {
  const row = await env.stockly
    .prepare(
      `SELECT symbol, price, day_low, day_high, volume, timestamp
       FROM stock_prices
       WHERE symbol = ?
       ORDER BY timestamp DESC
       LIMIT 1`
    )
    .bind(symbol)
    .first<DbRow>();

  return row ? mapDbRow(row) : null;
}

async function fetchQuoteFromApi(symbol: string): Promise<QuoteRecord> {
  const api = `${API_URL}/quote?symbol=${symbol}&apikey=${API_KEY}`;
  const res = await fetch(api);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${symbol}`);
  }
  const data = await res.json();
  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload) {
    throw new Error(`Empty payload for ${symbol}`);
  }
  return mapQuotePayload(symbol, payload);
}

async function insertQuote(env: Env, quote: QuoteRecord) {
  await env.stockly
    .prepare(
      `INSERT INTO stock_prices (symbol, price, day_low, day_high, volume, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      quote.symbol,
      quote.price,
      quote.dayLow,
      quote.dayHigh,
      quote.volume,
      quote.timestamp
    )
    .run();
}

export async function getStocks(url: URL, env: Env): Promise<Response> {
  const symbolsParam = url.searchParams.get("symbols");
  if (!symbolsParam) {
    return json({ error: "symbols required" }, 400);
  }

  const symbols = Array.from(
    new Set(
      symbolsParam
        .split(",")
        .map(normalizeSymbol)
        .filter((symbol) => symbol.length > 0)
    )
  );

  if (!symbols.length) {
    return json({ error: "symbols required" }, 400);
  }

  const resultBySymbol = new Map<string, QuoteRecord>();
  const toRefresh: string[] = [];

  for (const symbol of symbols) {
    const cacheKey = `quote:${symbol}`;
    const cacheEntry = getCacheEntry(cacheKey);

    if (cacheEntry && !cacheEntry.expired) {
      resultBySymbol.set(symbol, cacheEntry.data);
      continue;
    }

    const dbRecord = await getLatestFromDb(env, symbol);
    if (dbRecord && isFresh(dbRecord.timestamp)) {
      setCache(cacheKey, dbRecord, CACHE_TTL_SECONDS);
      resultBySymbol.set(symbol, dbRecord);
      continue;
    }

    toRefresh.push(symbol);
  }

  if (toRefresh.length) {
    try {
      const refreshed = await Promise.all(
        toRefresh.map(async (symbol) => {
          const quote = await fetchQuoteFromApi(symbol);
          await insertQuote(env, quote);
          setCache(`quote:${symbol}`, quote, CACHE_TTL_SECONDS);
          return quote;
        })
      );

      refreshed.forEach((quote) => {
        resultBySymbol.set(quote.symbol, quote);
      });
    } catch (error) {
      console.error("Failed to refresh quotes", error);
      return json({ error: "failed to fetch stocks" }, 500);
    }
  }

  const orderedResults = symbols
    .map((symbol) => resultBySymbol.get(symbol))
    .filter((quote): quote is QuoteRecord => Boolean(quote));

  return json(orderedResults);
}
