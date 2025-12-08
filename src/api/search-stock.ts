import { API_URL, API_KEY, json } from "../util";
import { getCache, setCache } from "./cache";
import type { Env } from "../index";

const DB_CACHE_TTL_SECONDS = 20 * 60;

type CachedSearchRow = {
  results: string;
  timestamp: number;
};

async function getDbCachedResults(
  env: Env,
  query: string
): Promise<any[] | null> {
  try {
    const row = await env.stockly
      .prepare(
        `SELECT results, timestamp
         FROM search_cache
         WHERE query = ?
         ORDER BY timestamp DESC
         LIMIT 1`
      )
      .bind(query)
      .first<CachedSearchRow>();

    if (!row) return null;

    const ageSeconds =
      Math.floor(Date.now() / 1000) - Number(row.timestamp ?? 0);
    if (ageSeconds >= DB_CACHE_TTL_SECONDS) {
      return null;
    }

    const parsed = JSON.parse(row.results);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error("Failed to read search cache", error);
    return null;
  }
}

/**
 * Calculate match score for ranking search results
 * Higher score = better match
 * Prioritizes exact matches (both symbol and name) equally
 */
function calculateMatchScore(query: string, item: any): number {
  const q = query.toLowerCase().trim();
  const symbol = (item.symbol || '').toLowerCase();
  const name = (item.name || '').toLowerCase();

  let score = 0;

  // Exact matches (highest priority - both symbol and name get same priority)
  if (symbol === q) score += 1000; // Exact symbol match (e.g., "amzn" === "amzn")
  if (name === q) score += 1000;   // Exact name match (e.g., "amazon" === "amazon")
  
  // If query matches symbol exactly, boost it significantly
  if (symbol === q) {
    score += 500; // Extra boost for exact symbol match
  }

  // Starts with (high priority)
  if (symbol.startsWith(q)) score += 800; // Symbol starts with query (e.g., "amzn" starts with "am")
  if (name.startsWith(q)) score += 750;   // Name starts with query (e.g., "amazon" starts with "am")

  // Contains (medium priority)
  if (symbol.includes(q)) score += 400; // Symbol contains query
  if (name.includes(q)) score += 350;   // Name contains query

  // Word boundaries in name (bonus for partial name matches)
  const nameWords = name.split(/\s+/);
  const queryWords = q.split(/\s+/);
  const matchedWords = queryWords.filter((qw) =>
    nameWords.some((nw) => nw.startsWith(qw))
  ).length;
  score += matchedWords * 50;

  // Bonus: If query is short (likely a symbol), prioritize symbol matches
  if (q.length <= 5 && symbol.startsWith(q)) {
    score += 200; // Extra boost for short queries matching symbol
  }

  // Bonus: If query matches company name (likely a name search), prioritize name matches
  if (q.length > 5 && name.includes(q)) {
    score += 150; // Extra boost for longer queries matching name
  }

  return score;
}

async function persistSearchResults(
  env: Env,
  query: string,
  results: any[]
) {
  try {
    await env.stockly
      .prepare(
        `INSERT INTO search_cache (query, results, timestamp)
         VALUES (?, ?, ?)`
      )
      .bind(query, JSON.stringify(results), Math.floor(Date.now() / 1000))
      .run();
  } catch (error) {
    console.error("Failed to persist search cache", error);
  }
}

import type { Logger } from "../logging/logger";

export async function searchStock(url: URL, env: Env, logger: Logger): Promise<Response> {
  const query = url.searchParams.get("query");

  if (!query || query.length < 2) {
    return json([]);
  }

  const normalizedQuery = query.toLowerCase();
  const cacheKey = `search:${normalizedQuery}`;

  const memoryCached = getCache(cacheKey);
  if (memoryCached) {
    return json(memoryCached);
  }

  const dbCached = await getDbCachedResults(env, normalizedQuery);
  if (dbCached) {
    setCache(cacheKey, dbCached, DB_CACHE_TTL_SECONDS);
    return json(dbCached);
  }

  try {
    // Use /search-name endpoint for company name searches (e.g., "amazon", "apple")
    // This endpoint is optimized for searching by company name, not just symbol
    // Fallback to /search-symbol for symbol searches (e.g., "AAPL", "AMZN")
    const nameApi = `${API_URL}/search-name?query=${encodeURIComponent(
      query
    )}&limit=20&apikey=${API_KEY}`;
    
    const symbolApi = `${API_URL}/search-symbol?query=${encodeURIComponent(
      query
    )}&limit=20&apikey=${API_KEY}`;

    // Fetch from both endpoints in parallel for best results
    const [nameRes, symbolRes] = await Promise.all([
      fetch(nameApi).catch(() => null),
      fetch(symbolApi).catch(() => null),
    ]);

    let combinedData: any[] = [];

    // Parse /search-name results (company name search)
    if (nameRes && nameRes.ok) {
      try {
        const nameData = await nameRes.json();
        if (Array.isArray(nameData) && nameData.length > 0) {
          combinedData.push(...nameData);
        }
      } catch (e) {
        console.warn("Failed to parse /search-name response:", e);
      }
    }

    // Parse /search-symbol results (symbol search - fallback)
    if (symbolRes && symbolRes.ok) {
      try {
        const symbolData = await symbolRes.json();
        if (Array.isArray(symbolData) && symbolData.length > 0) {
          combinedData.push(...symbolData);
        }
      } catch (e) {
        console.warn("Failed to parse /search-symbol response:", e);
      }
    }

    if (combinedData.length === 0) {
      return json([]);
    }

    // Process, rank, and deduplicate results
    const results = combinedData
      .map((item: any) => ({
        symbol: item.symbol,
        name: item.name,
        currency: item.currency,
        stockExchange: item.stockExchange,
        // Add match score for ranking (will be removed before returning)
        matchScore: calculateMatchScore(query, item),
      }))
      // Remove duplicates by symbol (keep first occurrence)
      .filter(
        (item, index, self) =>
          index === self.findIndex((t) => t.symbol === item.symbol)
      )
      // Sort by relevance (name matches first, then symbol matches)
      .sort((a, b) => b.matchScore - a.matchScore)
      // Limit to top 10 results
      .slice(0, 10)
      // Remove match score from response
      .map(({ matchScore, ...item }) => item);

    setCache(cacheKey, results, DB_CACHE_TTL_SECONDS);
    await persistSearchResults(env, normalizedQuery, results);

    return json(results);
  } catch (err) {
    console.error("Search error:", err);
    return json({ error: "failed to search" }, 500);
  }
}
