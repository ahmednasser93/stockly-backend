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
import {
  getCachedNews,
  updateNewsInCache,
  generateCacheKey as generateNewsCacheKey,
  flushPendingWritesToKV,
} from "./news-cache";
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
function normalizeNewsItem(item: any, symbol?: string) {
  // Normalize symbol: use item.symbol first, then fallback to parameter, then null
  // Always uppercase and trim for consistency
  let normalizedSymbol: string | null = null;
  if (item.symbol) {
    normalizedSymbol = String(item.symbol).trim().toUpperCase();
  } else if (symbol) {
    normalizedSymbol = String(symbol).trim().toUpperCase();
  }
  
  return {
    title: item.title || item.headline || "",
    text: item.text || item.description || item.content || "",
    url: item.url || item.link || "",
    publishedDate: item.publishedDate || item.date || item.published_date || "",
    image: item.image || item.imageUrl || null,
    site: item.site || item.source || "",
    type: item.type || "news",
    // Include normalized symbol from FMP API response or from parameter
    symbol: normalizedSymbol,
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
  if (isNaN(limit) || limit < 1 || limit > 250) {
    return undefined;
  }
  // FMP API max is 250
  return limit;
}

/**
 * Get stock news endpoint with pagination support
 * GET /v1/api/get-news?symbol=AAPL
 * GET /v1/api/get-news?symbols=AAPL,MSFT&from=2025-01-01&to=2025-01-31&page=0&limit=20
 */
import { authenticateRequest } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
import type { Logger } from "../logging/logger";

export async function getNews(request: Request, url: URL, env: Env, logger: Logger): Promise<Response> {
  // Support both single symbol and multiple symbols
  const symbolParam = url.searchParams.get("symbol");
  const symbolsParam = url.searchParams.get("symbols");

  if (!symbolParam && !symbolsParam) {
    return json({ error: "symbol or symbols parameter required" }, 400, request);
  }

  // Parse pagination parameters
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  const page = parsePage(url.searchParams.get("page"));
  const limit = parseLimit(url.searchParams.get("limit"));

  // Validate pagination parameters
  if (url.searchParams.has("from") && !from) {
    return json({ error: "invalid 'from' date format (expected YYYY-MM-DD)" }, 400, request);
  }
  if (url.searchParams.has("to") && !to) {
    return json({ error: "invalid 'to' date format (expected YYYY-MM-DD)" }, 400, request);
  }
  if (url.searchParams.has("page") && page === undefined) {
    return json({ error: "invalid 'page' parameter (must be non-negative integer)" }, 400, request);
  }
  if (url.searchParams.has("limit") && limit === undefined) {
    return json({ error: "invalid 'limit' parameter (must be 1-250)" }, 400, request);
  }

  // Validate date range if both provided
  if (from && to && from > to) {
    return json({ error: "'from' date must be before or equal to 'to' date" }, 400, request);
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
    return json({ error: "symbol or symbols parameter required" }, 400, request);
  }

  if (symbols.length === 0) {
    return json({ error: "invalid symbol format" }, 400, request);
  }

  // Limit to prevent abuse (same as get-stocks)
  if (symbols.length > 10) {
    return json({ error: "maximum 10 symbols allowed" }, 400, request);
  }

  // Get config to check polling interval
  const config = await getConfig(env);
  const pollingIntervalSec = config.pollingIntervalSec;

  // Generate cache key using the new cache module
  const cacheKey = generateNewsCacheKey(symbols, { from, to, page, limit });

  // Check sophisticated cache (memory + KV) with polling interval validation
  // Note: Only cache if no pagination params (to avoid cache bloat)
  // If pagination params exist, always fetch fresh
  const useCache = !from && !to && page === undefined && limit === undefined;
  
  if (useCache) {
    const cachedEntry = await getCachedNews(env.alertsKv, cacheKey, pollingIntervalSec);
    
    if (cachedEntry) {
      const ageSeconds = Math.floor((Date.now() - cachedEntry.cachedAt) / 1000);
      logger.info(`News cache hit for ${symbols.join(",")}`, {
        ageSeconds,
        pollingIntervalSec,
        cacheStatus: "HIT",
      });
      
      // Try to flush pending writes in background (non-blocking)
      if (env.alertsKv) {
        flushPendingWritesToKV(env.alertsKv, config.kvWriteIntervalSec).catch((err) => {
          logger.warn("Failed to flush pending news cache writes", { error: err });
        });
      }
      
      return json({
        symbols: symbols,
        news: cachedEntry.data.news || [],
        pagination: cachedEntry.data.pagination || {
          page: 0,
          limit: 20,
          total: cachedEntry.data.news?.length || 0,
        },
        cached: true,
      }, 200, request);
    }
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
      }, 200, request);
    }

    // Fetch news from FMP API with pagination
    const newsData = await fetchNewsFromApi(symbols, {
      from,
      to,
      page,
      limit,
    });

    // Normalize news items - FMP API returns symbol in each item, but we also pass it as fallback
    // When multiple symbols are queried, each news item should have its symbol from FMP API
    // However, if the symbol is missing from an item, we try to match it to one of the queried symbols
    const normalizedNews = newsData.map((item: any) => {
      // If item has symbol, use it; otherwise try to find matching symbol from queried list
      let symbol = item.symbol;
      if (!symbol && symbols.length === 1) {
        // Single symbol query - use it as fallback
        symbol = symbols[0];
      } else if (!symbol && symbols.length > 1) {
        // Multiple symbols - try to infer from title/text (last resort)
        // This is a fallback - FMP API should always include symbol
        const itemText = `${item.title || ''} ${item.text || ''}`.toUpperCase();
        symbol = symbols.find(s => itemText.includes(s.toUpperCase())) || null;
      }
      return normalizeNewsItem(item, symbol);
    });

    // Build pagination metadata
    const pagination = {
      page: page !== undefined ? page : 0,
      limit: limit !== undefined ? limit : 20,
      total: normalizedNews.length,
      hasMore: normalizedNews.length === (limit || 20), // Assume has more if we got full page
    };

    // Cache the result using sophisticated cache (memory + KV with batched writes)
    // Only cache first page without pagination params to avoid bloat
    if (useCache) {
      updateNewsInCache(cacheKey, {
        symbols,
        news: normalizedNews,
        pagination,
        cachedAt: Date.now(),
      });
      
      // Try to flush pending writes in background (non-blocking)
      if (env.alertsKv) {
        flushPendingWritesToKV(env.alertsKv, config.kvWriteIntervalSec).catch((err) => {
          logger.warn("Failed to flush pending news cache writes", { error: err });
        });
      }
    }

    return json({
      symbols: symbols,
      news: normalizedNews,
      pagination: pagination,
      cached: false,
    }, 200, request);
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
      200, // Return 200 with error flag, not 500 (graceful degradation)
      request
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

export async function getGeneralNews(request: Request, url: URL, env: Env, logger: Logger): Promise<Response> {
  const page = parsePage(url.searchParams.get("page"));
  const limit = parseLimit(url.searchParams.get("limit"));

  const config = await getConfig(env);
  const pollingIntervalSec = config.pollingIntervalSec;

  // Generate cache key for general news
  const cacheKey = generateNewsCacheKey(["general"], { page, limit });

  // Only cache first page
  const useCache = page === undefined || page === 0;
  
  if (useCache) {
    const cachedEntry = await getCachedNews(env.alertsKv, cacheKey, pollingIntervalSec);
    
    if (cachedEntry) {
      const pageNum = page ?? 0;
      const limitNum = limit ?? 20;
      const cachedNews = cachedEntry.data.news || [];
      const pagination = cachedEntry.data.pagination || {
        page: pageNum,
        limit: limitNum,
        total: cachedNews.length,
        hasMore: cachedNews.length >= limitNum,
      };
      
      logger.info(`General news cache hit`, {
        ageSeconds: Math.floor((Date.now() - cachedEntry.cachedAt) / 1000),
        pollingIntervalSec,
        cacheStatus: "HIT",
      });
      
      // Try to flush pending writes in background (non-blocking)
      if (env.alertsKv) {
        flushPendingWritesToKV(env.alertsKv, config.kvWriteIntervalSec).catch((err) => {
          logger.warn("Failed to flush pending news cache writes", { error: err });
        });
      }
      
      return json({
        news: cachedNews,
        pagination: pagination,
        cached: true,
      }, 200, request);
    }
  }

  try {
    const pageNum = page ?? 0;
    const limitNum = limit ?? 20;
    
    if (config.featureFlags.simulateProviderFailure) {
      return json({ 
        news: [], 
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          hasMore: false,
        },
        cached: false, 
        stale_reason: "simulation_mode" 
      }, 200, request);
    }

    const newsData = await fetchGeneralNewsFromApi({ page, limit });
    // General news doesn't have symbols (it's general market news)
    const normalizedNews = newsData.map((item: any) => normalizeNewsItem(item));

    // Build pagination metadata
    const pagination = {
      page: pageNum,
      limit: limitNum,
      total: normalizedNews.length,
      // If we got a full page, assume there might be more
      // If we got fewer, we've reached the end
      hasMore: normalizedNews.length >= limitNum,
    };

    if (useCache) {
      updateNewsInCache(cacheKey, {
        symbols: ["general"],
        news: normalizedNews,
        pagination,
        cachedAt: Date.now(),
      });
      
      // Try to flush pending writes in background (non-blocking)
      if (env.alertsKv) {
        flushPendingWritesToKV(env.alertsKv, config.kvWriteIntervalSec).catch((err) => {
          logger.warn("Failed to flush pending news cache writes", { error: err });
        });
      }
    }

    return json({
      news: normalizedNews,
      pagination: pagination,
      cached: false,
    }, 200, request);
  } catch (error) {
    logger.error("Failed to fetch general news", error);
    const pageNum = page ?? 0;
    const limitNum = limit ?? 20;
    return json({ 
      news: [], 
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: 0,
        hasMore: false,
      },
      error: "Failed to fetch general news" 
    }, 200, request);
  }
}

export async function getFavoriteNews(
  request: Request,
  url: URL,
  env: Env,
  logger: Logger
): Promise<Response> {
  // Authenticate request to get userId
  const auth = await authenticateRequest(
    request,
    env.JWT_SECRET || "",
    env.JWT_REFRESH_SECRET
  );

  if (!auth) {
    const { response } = createErrorResponse(
      "AUTH_MISSING_TOKEN",
      "Authentication required",
      undefined,
      undefined,
      request
    );
    return response;
  }

  const username = auth.username;

  try {
    logger.info("Fetching favorite news", { username });

    // Fetch user preferences (by username)
    const row = await env.stockly
      .prepare(`SELECT news_favorite_symbols FROM user_settings WHERE username = ?`)
      .bind(username)
      .first<{ news_favorite_symbols: string }>();

    let symbols: string[] = [];
    if (row && row.news_favorite_symbols) {
      try {
        symbols = JSON.parse(row.news_favorite_symbols);
      } catch (e) {
        logger.warn("Failed to parse news_favorite_symbols", { username, error: e });
      }
    }

    if (symbols.length === 0) {
      logger.info("No favorite symbols selected", { username });
      return json({ 
        news: [], 
        pagination: { page: 0, limit: 20, total: 0, hasMore: false },
        message: "No favorite symbols selected" 
      }, 200, request);
    }

    logger.info("Favorite symbols found", { username, symbolCount: symbols.length, symbols });

    // Reuse getNews logic by constructing a new URL with symbols
    // This avoids duplicating the fetching/normalization logic
    // Pagination params (page, limit, from, to) are already in the URL and will be passed through
    const newUrl = new URL(url.toString());
    newUrl.searchParams.set("symbols", symbols.join(","));

    // Call getNews with the new URL (getNews already supports pagination)
    return getNews(request, newUrl, env, logger);

  } catch (error) {
    logger.error("Failed to fetch favorite news", error, { username });
    return json({ error: "Failed to fetch favorite news" }, 500, request);
  }
}

