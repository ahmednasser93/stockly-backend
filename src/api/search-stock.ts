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

export async function searchStock(url: URL, env: Env): Promise<Response> {
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
    const api = `${API_URL}/search-symbol?query=${encodeURIComponent(
      query
    )}&limit=5&apikey=${API_KEY}`;

    const res = await fetch(api);
    const data = await res.json();

    const results = Array.isArray(data)
      ? data.map((item: any) => ({
          symbol: item.symbol,
          name: item.name,
          currency: item.currency,
          stockExchange: item.stockExchange,
        }))
      : [];

    setCache(cacheKey, results, DB_CACHE_TTL_SECONDS);
    await persistSearchResults(env, normalizedQuery, results);

    return json(results);
  } catch (err) {
    return json({ error: "failed to search" }, 500);
  }
}
