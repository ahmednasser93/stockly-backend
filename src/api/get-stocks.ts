import { API_KEY, API_URL, json } from "../util";
import type { Env } from "../index";
import { getCacheIfValid, setCache } from "./cache";
import { getConfig } from "./config";

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

async function fetchProfileFromApi(symbol: string, quote?: any): Promise<{ profile: any; description: string | null }> {
  // Fetch company profile which includes image, description, and additional fields
  // Try multiple endpoint versions and paths
  let profile = null;
  let profileDescription = null;
  
  // Try all possible FMP profile endpoints
  // IMPORTANT: Use query parameter ?symbol= not path parameter /profile/SYMBOL
  const profileEndpoints = [
    // Correct format: /stable/profile?symbol=SYMBOL (with query param)
    `${API_URL}/profile?symbol=${symbol}&apikey=${API_KEY}`,
    // Try path-based format as fallback (some endpoints use this)
    `${API_URL}/profile/${symbol}?apikey=${API_KEY}`,
    `${API_URL}/company/profile/${symbol}?apikey=${API_KEY}`,
    // Try v3 API as last resort (requires legacy subscription)
    `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${API_KEY}`,
  ];
  
  for (const profileApi of profileEndpoints) {
    try {
      const profileRes = await fetch(profileApi, {
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        
        if (Array.isArray(profileData) && profileData.length === 0) {
          continue;
        }
        
        const fetchedProfile = Array.isArray(profileData) && profileData.length > 0 ? profileData[0] : profileData;
        
        // Check for error messages
        if (fetchedProfile && fetchedProfile['Error Message']) {
          continue;
        }
        
        if (fetchedProfile && (fetchedProfile.symbol || fetchedProfile.Symbol)) {
          profile = fetchedProfile;
          // Capture description from profile if available (try multiple field names)
          const desc = fetchedProfile.description || fetchedProfile.Description || fetchedProfile.descriptionText;
          if (desc) {
            profileDescription = desc;
            break;
          }
          // If we got a valid profile, use it even without description
          break;
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch profile from ${profileApi}:`, error);
    }
  }
  
  // Capture description from quote before merging
  const quoteDescription = quote?.description || null;
  
  // If profile endpoints don't work, construct image URL from symbol pattern
  // Based on user's example: https://images.financialmodelingprep.com/symbol/AMZN.png
  if (!profile || !profile.image) {
    profile = {
      ...profile,
      image: `https://images.financialmodelingprep.com/symbol/${symbol.toUpperCase()}.png`,
    };
  }

  // Try to get description from Wikipedia as fallback if FMP doesn't provide it
  let wikipediaDescription = null;
  if (!profileDescription && !quoteDescription) {
    try {
      // Get company name from quote or profile
      const companyName = quote?.name || quote?.companyName || profile?.name || profile?.companyName || symbol;
      
      // Try to fetch from Wikipedia API
      const wikiSearchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(companyName)}`;
      const wikiRes = await fetch(wikiSearchUrl);
      
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json() as { extract?: string };
        if (wikiData.extract) {
          wikipediaDescription = wikiData.extract;
        }
      }
    } catch (wikiError) {
      console.warn(`Failed to fetch from Wikipedia:`, wikiError);
    }
  }

  // Determine final description: profile description > quote description > wikipedia
  const finalDescription = profileDescription || quoteDescription || profile?.description || wikipediaDescription || null;
  
  return {
    profile: profile || { image: `https://images.financialmodelingprep.com/symbol/${symbol.toUpperCase()}.png` },
    description: finalDescription,
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
  
  // Fetch profile data to get image, description, and additional fields
  const { profile, description } = await fetchProfileFromApi(symbol, payload);
  
  // Merge quote with profile (profile fields take precedence)
  // Explicitly preserve description, name, and ensure image is set
  const parsed = {
    ...payload,
    ...(profile || {}),
    // Explicitly set description to ensure it's not lost during merge
    description: description,
    // Ensure name is set from companyName if name is missing
    name: payload.name || payload.companyName || profile?.name || profile?.companyName || symbol,
    // Ensure image is always set
    image: profile?.image || `https://images.financialmodelingprep.com/symbol/${symbol.toUpperCase()}.png`,
  };
  
  return parsed;
}

/**
 * Fetch multiple quotes from external API in a single batch request
 * Financial Modeling Prep API supports comma-separated symbols
 * Returns full payload with all fields (image, changePercentage, etc.)
 */
async function fetchQuotesBatchFromApi(symbols: string[]): Promise<any[]> {
  if (symbols.length === 0) return [];
  
  // Financial Modeling Prep /stable/quote endpoint doesn't support batch requests with comma-separated symbols
  // It returns empty arrays. So we need to fetch each symbol individually in parallel
  const quotePromises = symbols.map((symbol) => fetchQuoteFromApi(symbol));
  const quoteResults = await Promise.allSettled(quotePromises);
  
  // Filter out failed requests and return successful quotes
  const results: any[] = [];
  for (let i = 0; i < quoteResults.length; i++) {
    const result = quoteResults[i];
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      console.warn(`Failed to fetch quote for ${symbols[i]}:`, result.reason);
    }
  }
  
  return results;
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

  // Get config to check polling interval
  const config = await getConfig(env);
  const pollingIntervalSec = config.pollingIntervalSec;

  const resultBySymbol = new Map<string, any>();
  const toRefresh: string[] = [];

  for (const symbol of symbols) {
    const cacheKey = `quote:${symbol}`;
    // Check cache with polling interval validation
    const cachedEntry = getCacheIfValid(cacheKey, pollingIntervalSec);

    if (cachedEntry) {
      // Cache is still valid (age < pollingIntervalSec), use cached data
      resultBySymbol.set(symbol, cachedEntry.data);
      continue;
    }

    // For database records, check if fresh based on polling interval
    const dbRecord = await getLatestFromDb(env, symbol);
    if (dbRecord && isFresh(dbRecord.timestamp, pollingIntervalSec)) {
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
          
          // Cache the FULL payload with all fields using polling interval from config
          setCache(`quote:${quote.symbol}`, quote, pollingIntervalSec + 5);
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
