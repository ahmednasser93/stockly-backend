/**
 * Stock News API endpoint
 * Fetches latest news for stock symbols from FMP API
 * Follows the same caching and refresh patterns as get-stock and get-stocks
 * 
 * FMP Endpoint: /stable/news/stock?symbols=AAPL&apikey=...
 */

import { API_KEY, API_URL, json } from "../util";
import type { Env } from "../index";
import { getCacheIfValid, setCache } from "./cache";
import { getConfig } from "./config";

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

/**
 * Fetch stock news from FMP API with pagination support
 * Endpoint: /stable/news/stock?symbols=AAPL,MSFT&from=2025-01-01&to=2025-01-31&page=0&limit=20&apikey=...
 */
async function fetchNewsFromApi(
  symbols: string[],
  options?: {
    from?: string; // YYYY-MM-DD format
    to?: string; // YYYY-MM-DD format
    page?: number; // Page number (0-based)
    limit?: number; // Results per page (max 250, default 20)
  }
): Promise<any[]> {
  // FMP API supports comma-separated symbols
  const symbolsParam = symbols.join(",");

  // Build query parameters
  const params = new URLSearchParams({
    symbols: symbolsParam,
    apikey: API_KEY,
  });

  // Add pagination parameters if provided
  if (options?.from) {
    params.append("from", options.from);
  }
  if (options?.to) {
    params.append("to", options.to);
  }
  if (options?.page !== undefined) {
    params.append("page", options.page.toString());
  }
  if (options?.limit !== undefined) {
    params.append("limit", Math.min(options.limit, 250).toString()); // Max 250
  }

  const api = `${API_URL}/news/stock?${params.toString()}`;

  try {
    const res = await fetch(api, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`FMP API failed: HTTP ${res.status}`);
    }

    const data = await res.json();

    // Check for FMP API error messages
    if (data && typeof data === "object" && !Array.isArray(data)) {
      if ("Error Message" in data || "error" in data) {
        throw new Error("FMP API error response");
      }
    }

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`Failed to fetch news from FMP API for symbols ${symbolsParam}:`, error);
    throw error;
  }
}

/**
 * Normalize news data to consistent format
 */
function normalizeNewsItem(item: any) {
  return {
    title: item.title || item.headline || "",
    text: item.text || item.description || item.content || "",
    url: item.url || item.link || "",
    publishedDate: item.publishedDate || item.date || item.published_date || "",
    image: item.image || item.imageUrl || null,
    site: item.site || item.source || "",
    type: item.type || "news",
  };
}

/**
 * Validate and parse date string (YYYY-MM-DD format)
 */
function parseDate(dateStr: string | null): string | undefined {
  if (!dateStr) return undefined;

  // Basic validation: YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    return undefined;
  }

  // Validate it's a valid date
  const date = new Date(dateStr + "T00:00:00Z");
  if (isNaN(date.getTime())) {
    return undefined;
  }

  return dateStr;
}

/**
 * Validate and parse page number (0-based)
 */
function parsePage(pageStr: string | null): number | undefined {
  if (!pageStr) return undefined;
  const page = parseInt(pageStr, 10);
  if (isNaN(page) || page < 0) {
    return undefined;
  }
  return page;
}

/**
 * Validate and parse limit (1-250)
 */
function parseLimit(limitStr: string | null): number | undefined {
  if (!limitStr) return undefined;
  const limit = parseInt(limitStr, 10);
  if (isNaN(limit) || limit < 1) {
    return undefined;
  }
  // FMP API max is 250
  return Math.min(limit, 250);
}

/**
 * Get stock news endpoint with pagination support
 * GET /v1/api/get-news?symbol=AAPL
 * GET /v1/api/get-news?symbols=AAPL,MSFT&from=2025-01-01&to=2025-01-31&page=0&limit=20
 */
import type { Logger } from "../logging/logger";

export async function getNews(url: URL, env: Env, logger: Logger): Promise<Response> {
  // Support both single symbol and multiple symbols
  const symbolParam = url.searchParams.get("symbol");
  const symbolsParam = url.searchParams.get("symbols");

  if (!symbolParam && !symbolsParam) {
    return json({ error: "symbol or symbols parameter required" }, 400);
  }

  // Parse pagination parameters
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  const page = parsePage(url.searchParams.get("page"));
  const limit = parseLimit(url.searchParams.get("limit"));

  // Validate pagination parameters
  if (url.searchParams.has("from") && !from) {
    return json({ error: "invalid 'from' date format (expected YYYY-MM-DD)" }, 400);
  }
  if (url.searchParams.has("to") && !to) {
    return json({ error: "invalid 'to' date format (expected YYYY-MM-DD)" }, 400);
  }
  if (url.searchParams.has("page") && page === undefined) {
    return json({ error: "invalid 'page' parameter (must be non-negative integer)" }, 400);
  }
  if (url.searchParams.has("limit") && limit === undefined) {
    return json({ error: "invalid 'limit' parameter (must be 1-250)" }, 400);
  }

  // Validate date range if both provided
  if (from && to && from > to) {
    return json({ error: "'from' date must be before or equal to 'to' date" }, 400);
  }

  // Normalize symbols
  let symbols: string[];
  if (symbolsParam) {
    symbols = Array.from(
      new Set(
        symbolsParam
          .split(",")
          .map(normalizeSymbol)
          .filter((symbol) => symbol.length > 0)
      )
    );
  } else if (symbolParam) {
    symbols = [normalizeSymbol(symbolParam)];
  } else {
    return json({ error: "symbol or symbols parameter required" }, 400);
  }

  if (symbols.length === 0) {
    return json({ error: "invalid symbol format" }, 400);
  }

  // Limit to prevent abuse (same as get-stocks)
  if (symbols.length > 10) {
    return json({ error: "maximum 10 symbols allowed" }, 400);
  }

  // Get config to check polling interval
  const config = await getConfig(env);
  const pollingIntervalSec = config.pollingIntervalSec;

  // Create cache key from sorted symbols and pagination params (for consistent caching)
  // Note: Different pagination params = different cache key
  const cacheKeyParts = [
    `news:${symbols.sort().join(",")}`,
    from ? `from:${from}` : "",
    to ? `to:${to}` : "",
    page !== undefined ? `page:${page}` : "",
    limit !== undefined ? `limit:${limit}` : "",
  ].filter(Boolean);
  const cacheKey = cacheKeyParts.join("|");

  // Check cache with polling interval validation
  // Note: Only cache if no pagination params (to avoid cache bloat)
  // If pagination params exist, always fetch fresh (or cache with shorter TTL)
  const useCache = !from && !to && page === undefined && limit === undefined;
  const cachedEntry = useCache ? getCacheIfValid(cacheKey, pollingIntervalSec) : null;

  if (cachedEntry) {
    const ageSeconds = Math.floor((Date.now() - cachedEntry.cachedAt) / 1000);
    console.log(
      `News cache hit for ${symbols.join(",")}: age=${ageSeconds}s < interval=${pollingIntervalSec}s`
    );
    return json({
      symbols: symbols,
      news: cachedEntry.data.news || cachedEntry.data,
      pagination: cachedEntry.data.pagination || {
        page: 0,
        limit: 20,
        total: cachedEntry.data.news?.length || cachedEntry.data?.length || 0,
      },
      cached: true,
    });
  }

  // Cache miss or expired - fetch from API
  console.log(`News cache miss for ${symbols.join(",")}, fetching from API...`);

  try {
    // Check if provider failure simulation is enabled
    if (config.featureFlags.simulateProviderFailure) {
      // Return empty array in simulation mode
      return json({
        symbols: symbols,
        news: [],
        pagination: {
          page: page || 0,
          limit: limit || 20,
          total: 0,
        },
        cached: false,
        partial: true,
        stale_reason: "simulation_mode",
      });
    }

    // Fetch news from FMP API with pagination
    const newsData = await fetchNewsFromApi(symbols, {
      from,
      to,
      page,
      limit,
    });

    // Normalize news items
    const normalizedNews = newsData.map(normalizeNewsItem);

    // Build pagination metadata
    const pagination = {
      page: page !== undefined ? page : 0,
      limit: limit !== undefined ? limit : 20,
      total: normalizedNews.length,
      hasMore: normalizedNews.length === (limit || 20), // Assume has more if we got full page
    };

    // Cache the result (only cache first page without pagination params to avoid bloat)
    if (useCache) {
      setCache(cacheKey, { news: normalizedNews, pagination }, pollingIntervalSec + 5);
    }

    return json({
      symbols: symbols,
      news: normalizedNews,
      pagination: pagination,
      cached: false,
    });
  } catch (error) {
    console.error(`Error fetching news for ${symbols.join(",")}:`, error);

    // On error, return empty array with error flag
    // This allows the frontend to handle gracefully
    return json(
      {
        symbols: symbols,
        news: [],
        pagination: {
          page: page !== undefined ? page : 0,
          limit: limit !== undefined ? limit : 20,
          total: 0,
        },
        error: "Failed to fetch news",
        partial: true,
        cached: false,
      },
      200 // Return 200 with error flag, not 500 (graceful degradation)
    );
  }
}

/**
 * Fetch general news from FMP API
 * Endpoint: /stable/news/general-latest?page=0&limit=20
 */
async function fetchGeneralNewsFromApi(
  options?: {
    page?: number;
    limit?: number;
  }
): Promise<any[]> {
  const params = new URLSearchParams({
    apikey: API_KEY,
  });

  if (options?.page !== undefined) {
    params.append("page", options.page.toString());
  }
  if (options?.limit !== undefined) {
    params.append("limit", Math.min(options.limit, 250).toString());
  }

  const api = `${API_URL}/news/general-latest?${params.toString()}`;

  try {
    const res = await fetch(api, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`FMP API failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Failed to fetch general news from FMP API:", error);
    throw error;
  }
}

export async function getGeneralNews(url: URL, env: Env, logger: Logger): Promise<Response> {
  const page = parsePage(url.searchParams.get("page"));
  const limit = parseLimit(url.searchParams.get("limit"));

  const config = await getConfig(env);
  const pollingIntervalSec = config.pollingIntervalSec;

  const cacheKey = `news:general:${page || 0}:${limit || 20}`;

  // Only cache first page
  const useCache = page === undefined || page === 0;
  const cachedEntry = useCache ? getCacheIfValid(cacheKey, pollingIntervalSec) : null;

  if (cachedEntry) {
    return json({
      news: cachedEntry.data.news,
      cached: true,
    });
  }

  try {
    if (config.featureFlags.simulateProviderFailure) {
      return json({ news: [], cached: false, stale_reason: "simulation_mode" });
    }

    const newsData = await fetchGeneralNewsFromApi({ page, limit });
    const normalizedNews = newsData.map(normalizeNewsItem);

    if (useCache) {
      setCache(cacheKey, { news: normalizedNews }, pollingIntervalSec + 5);
    }

    return json({
      news: normalizedNews,
      cached: false,
    });
  } catch (error) {
    logger.error("Failed to fetch general news", error);
    return json({ news: [], error: "Failed to fetch general news" }, 200);
  }
}

export async function getFavoriteNews(url: URL, env: Env, logger: Logger): Promise<Response> {
  const userId = url.searchParams.get("userId") || logger.getContext().userId;

  if (!userId) {
    logger.warn("getFavoriteNews: userId is required", { url: url.toString() });
    return json({ error: "userId is required" }, 400);
  }

  try {
    logger.info("Fetching favorite news", { userId });

    // Fetch user preferences
    const row = await env.stockly
      .prepare(`SELECT news_favorite_symbols FROM user_settings WHERE user_id = ?`)
      .bind(userId)
      .first<{ news_favorite_symbols: string }>();

    let symbols: string[] = [];
    if (row && row.news_favorite_symbols) {
      try {
        symbols = JSON.parse(row.news_favorite_symbols);
      } catch (e) {
        logger.warn("Failed to parse news_favorite_symbols", { userId, error: e });
      }
    }

    if (symbols.length === 0) {
      logger.info("No favorite symbols selected", { userId });
      return json({ 
        news: [], 
        pagination: { page: 0, limit: 20, total: 0, hasMore: false },
        message: "No favorite symbols selected" 
      });
    }

    logger.info("Favorite symbols found", { userId, symbolCount: symbols.length, symbols });

    // Reuse getNews logic by constructing a new URL with symbols
    // This avoids duplicating the fetching/normalization logic
    // Pagination params (page, limit, from, to) are already in the URL and will be passed through
    const newUrl = new URL(url.toString());
    newUrl.searchParams.set("symbols", symbols.join(","));

    // Call getNews with the new URL (getNews already supports pagination)
    return getNews(newUrl, env, logger);

  } catch (error) {
    logger.error("Failed to fetch favorite news", error, { userId });
    return json({ error: "Failed to fetch favorite news" }, 500);
  }
}

