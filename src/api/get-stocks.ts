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

async function fetchProfileFromApi(symbol: string): Promise<any> {
  // Fetch company profile which includes image and other details
  // IMPORTANT: Use query parameter ?symbol= not path parameter /profile/SYMBOL
  const profileEndpoints = [
    // Correct format: /stable/profile?symbol=SYMBOL (with query param)
    `${API_URL}/profile?symbol=${symbol}&apikey=${API_KEY}`,
    // Try path-based format as fallback
    `${API_URL}/profile/${symbol}?apikey=${API_KEY}`,
    `${API_URL}/company/profile/${symbol}?apikey=${API_KEY}`,
  ];
  
  for (const profileApi of profileEndpoints) {
    try {
      const profileRes = await fetch(profileApi);
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        const profile = Array.isArray(profileData) && profileData.length > 0 ? profileData[0] : profileData;
        if (profile && (profile.image || profile.symbol)) {
          return profile;
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch profile from ${profileApi}:`, error);
    }
  }
  
  // If profile endpoints don't work, construct image URL from symbol pattern
  // Based on user's example: https://images.financialmodelingprep.com/symbol/AMZN.png
  return {
    image: `https://images.financialmodelingprep.com/symbol/${symbol.toUpperCase()}.png`,
  };
}

async function fetchQuoteFromApi(symbol: string): Promise<any> {
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
  
  // Fetch profile data to get image and additional fields
  const profile = await fetchProfileFromApi(symbol);
  
  // Merge quote data with profile data (profile fields take precedence)
  return {
    ...payload,
    ...(profile || {}),
  };
}

/**
 * Fetch multiple quotes from external API in a single batch request
 * Financial Modeling Prep API supports comma-separated symbols
 * Returns full payload with all fields (image, changePercentage, etc.)
 */
async function fetchQuotesBatchFromApi(symbols: string[]): Promise<any[]> {
  if (symbols.length === 0) return [];
  if (symbols.length === 1) {
    const quote = await fetchQuoteFromApi(symbols[0]);
    return [quote];
  }
  
  // Batch request with comma-separated symbols for quotes
  const symbolsParam = symbols.join(',');
  const quoteApi = `${API_URL}/quote?symbol=${symbolsParam}&apikey=${API_KEY}`;
  const quoteRes = await fetch(quoteApi);
  
  if (!quoteRes.ok) {
    throw new Error(`Failed to fetch batch for symbols: ${symbolsParam}`);
  }
  
  const quoteData = await quoteRes.json();
  const quoteResults = Array.isArray(quoteData) ? quoteData : [quoteData];
  
  // Build quotes map
  const quotesMap = new Map<string, any>();
  for (const payload of quoteResults) {
    if (payload && payload.symbol) {
      quotesMap.set(payload.symbol.toUpperCase(), payload);
    }
  }
  
  // Fetch profiles in parallel for all symbols
  const profilePromises = symbols.map((symbol) => fetchProfileFromApi(symbol));
  const profiles = await Promise.all(profilePromises);
  
  // Merge profiles with quotes (profile fields take precedence)
  return symbols
    .map((symbol, index) => {
      const quote = quotesMap.get(symbol.toUpperCase());
      const profile = profiles[index];
      
      if (!quote) return null;
      
      // Merge quote with profile data
      // Prioritize description: profile description > quote description
      const profileDesc = profile?.description || null;
      return {
        ...quote,
        ...(profile || {}),
        // Ensure description is preserved (profile first, then quote)
        description: profileDesc || quote?.description || null,
      };
    })
    .filter((quote): quote is any => quote !== null);
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

  const resultBySymbol = new Map<string, any>();
  const toRefresh: string[] = [];

  for (const symbol of symbols) {
    const cacheKey = `quote:${symbol}`;
    const cacheEntry = getCacheEntry(cacheKey);

    if (cacheEntry && !cacheEntry.expired) {
      // Use cached full payload
      resultBySymbol.set(symbol, cacheEntry.data);
      continue;
    }

    // For database records, we still use limited QuoteRecord, but prefer API refresh
    const dbRecord = await getLatestFromDb(env, symbol);
    if (dbRecord && isFresh(dbRecord.timestamp)) {
      // If DB record is fresh but we need full data, mark for refresh
      // For now, we'll refresh to get full payload with image and changePercentage
      toRefresh.push(symbol);
      continue;
    }

    toRefresh.push(symbol);
  }

  if (toRefresh.length) {
    try {
      // Fetch all required quotes in a single batch request to external API
      // This returns full payload with all fields (image, changePercentage, etc.)
      const refreshed = await fetchQuotesBatchFromApi(toRefresh);
      
      // Insert price data into database (for quick lookups) and cache full payload
      await Promise.all(
        refreshed.map(async (quote) => {
          // Extract limited fields for DB storage
          const dbQuote: QuoteRecord = mapQuotePayload(quote.symbol, quote);
          await insertQuote(env, dbQuote);
          
          // Cache the FULL payload with all fields
          setCache(`quote:${quote.symbol}`, quote, CACHE_TTL_SECONDS);
          resultBySymbol.set(quote.symbol, quote);
        })
      );
    } catch (error) {
      console.error("Failed to refresh quotes", error);
      return json({ error: "failed to fetch stocks" }, 500);
    }
  }

  // Return full payloads with all fields
  const orderedResults = symbols
    .map((symbol) => resultBySymbol.get(symbol))
    .filter((quote): quote is any => Boolean(quote));

  return json(orderedResults);
}
