import type { IQuotesRepository } from '../interfaces/IQuotesRepository';
import type { IDatabase } from '../../infrastructure/database/IDatabase';
import type { Quote } from '@stockly/shared/types';
import { API_KEY, API_URL } from '../../util';
import { getCacheIfValid, setCache } from '../../api/cache';
import { getConfig } from '../../api/config';
import { fetchAndSaveHistoricalPrice } from '../../api/historical-prices';
import { fetchProfileFromApi } from './profile-fetcher';
import type { Env } from '../../index';
import type { Logger } from '../../logging/logger';

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

const isFresh = (timestamp?: number | null, pollingIntervalSec: number = 30) => {
  if (!timestamp) return false;
  return nowSeconds() - timestamp <= pollingIntervalSec;
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
    timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : nowSeconds(),
  };
}

async function getLatestFromDb(db: IDatabase, symbol: string): Promise<QuoteRecord | null> {
  const row = await db
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

// Profile fetching logic moved to profile-fetcher.ts for better testability

async function fetchQuoteFromApi(symbol: string, logger?: Logger): Promise<any> {
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

  const { profile, description } = await fetchProfileFromApi(symbol, payload, logger);

  const parsed = {
    ...payload,
    ...(profile || {}),
    description: description,
    name: payload.name || payload.companyName || profile?.name || profile?.companyName || symbol,
    image: profile?.image || `https://images.financialmodelingprep.com/symbol/${symbol.toUpperCase()}.png`,
  };

  return parsed;
}

async function fetchQuotesBatchFromApi(symbols: string[], logger?: Logger): Promise<any[]> {
  if (symbols.length === 0) return [];

  const quotePromises = symbols.map((symbol) => fetchQuoteFromApi(symbol, logger));
  const quoteResults = await Promise.allSettled(quotePromises);

  const results: any[] = [];
  for (let i = 0; i < quoteResults.length; i++) {
    const result = quoteResults[i];
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      logger?.warn(`Failed to fetch quote for ${symbols[i]}:`, result.reason);
    }
  }

  return results;
}

async function insertQuote(db: IDatabase, quote: QuoteRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO stock_prices (symbol, price, day_low, day_high, volume, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(quote.symbol, quote.price, quote.dayLow, quote.dayHigh, quote.volume, quote.timestamp)
    .run();
}

export class QuotesRepository implements IQuotesRepository {
  constructor(private db: IDatabase, private env: Env, private logger: Logger) {}

  async getQuote(symbol: string): Promise<Quote> {
    const normalizedSymbol = normalizeSymbol(symbol);
    const cacheKey = `quote:${normalizedSymbol}`;

    const config = await getConfig(this.env);
    const pollingIntervalSec = config.pollingIntervalSec;

    // Check cache
    const cachedEntry = getCacheIfValid(cacheKey, pollingIntervalSec);
    if (cachedEntry) {
      return cachedEntry.data as Quote;
    }

    // Check DB
    const dbRecord = await getLatestFromDb(this.db, normalizedSymbol);
    if (dbRecord && isFresh(dbRecord.timestamp, pollingIntervalSec)) {
      // Return from DB if fresh
      return {
        symbol: dbRecord.symbol,
        price: dbRecord.price,
        dayLow: dbRecord.dayLow,
        dayHigh: dbRecord.dayHigh,
        volume: dbRecord.volume,
        timestamp: dbRecord.timestamp,
      } as Quote;
    }

    // Fetch from API
    const quote = await fetchQuoteFromApi(normalizedSymbol, this.logger);

    // Save to DB
    const dbQuote = mapQuotePayload(normalizedSymbol, quote);
    await insertQuote(this.db, dbQuote);

    // Cache
    setCache(cacheKey, quote, pollingIntervalSec + 5);

    // Save historical in background (if ctx available, handled by controller)
    return quote as Quote;
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const normalizedSymbols = symbols.map(normalizeSymbol).filter((s) => s.length > 0);
    if (normalizedSymbols.length === 0) {
      return [];
    }

    const config = await getConfig(this.env);
    const pollingIntervalSec = config.pollingIntervalSec;

    const resultBySymbol = new Map<string, any>();
    const toRefresh: string[] = [];

    for (const symbol of normalizedSymbols) {
      const cacheKey = `quote:${symbol}`;
      const cachedEntry = getCacheIfValid(cacheKey, pollingIntervalSec);

      if (cachedEntry) {
        resultBySymbol.set(symbol, cachedEntry.data);
        continue;
      }

      const dbRecord = await getLatestFromDb(this.db, symbol);
      if (dbRecord && isFresh(dbRecord.timestamp, pollingIntervalSec)) {
        toRefresh.push(symbol); // Still refresh to get full payload
        continue;
      }

      toRefresh.push(symbol);
    }

    if (toRefresh.length) {
      const refreshed = await fetchQuotesBatchFromApi(toRefresh, this.logger);

      await Promise.all(
        refreshed.map(async (quote) => {
          const dbQuote = mapQuotePayload(quote.symbol, quote);
          await insertQuote(this.db, dbQuote);
          setCache(`quote:${quote.symbol}`, quote, pollingIntervalSec + 5);
          resultBySymbol.set(quote.symbol, quote);
        })
      );
    }

    const orderedResults = normalizedSymbols
      .map((symbol) => resultBySymbol.get(symbol))
      .filter((quote): quote is Quote => Boolean(quote));

    return orderedResults;
  }

  async getStaleQuote(symbol: string): Promise<Quote | null> {
    const normalizedSymbol = normalizeSymbol(symbol);
    const dbRecord = await getLatestFromDb(this.db, normalizedSymbol);

    if (dbRecord) {
      return {
        symbol: dbRecord.symbol,
        price: dbRecord.price,
        dayLow: dbRecord.dayLow,
        dayHigh: dbRecord.dayHigh,
        volume: dbRecord.volume,
        timestamp: dbRecord.timestamp,
        lastUpdatedAt: new Date(dbRecord.timestamp * 1000).toISOString(),
        stale: true,
      } as Quote;
    }

    return null;
  }
}

