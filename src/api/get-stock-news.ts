/**
 * Route handler for /v1/api/get-stock-news
 * Fetches stock news from FMP API
 * Follows the same caching and refresh patterns as get-stock.ts
 */

import { getCacheIfValid, setCache } from "./cache";
import type { Env } from "../index";
import { API_KEY, API_URL, json } from "../util";
import { getConfig } from "./config";

export interface StockNewsItem {
  title: string;
  text: string;
  url: string;
  publishedDate: string;
  image?: string;
  source?: string;
}

import type { Logger } from "../logging/logger";

export async function getStockNews(request: Request, url: URL, env: Env, logger: Logger): Promise<Response> {
  const symbol = url.searchParams.get("symbol");

  if (!symbol) {
    return json({ error: "symbol required" }, 400, request);
  }

  const normalizedSymbol = symbol.trim().toUpperCase();
  const cacheKey = `news:${normalizedSymbol}`;

  // Get config first to check polling interval
  const config = await getConfig(env);
  const pollingIntervalSec = config.pollingIntervalSec;

  // Check cache with polling interval validation
  const cachedEntry = getCacheIfValid(cacheKey, pollingIntervalSec);
  if (cachedEntry) {
    const ageSeconds = Math.floor((Date.now() - cachedEntry.cachedAt) / 1000);
    console.log(`Cache hit for news ${normalizedSymbol}: age=${ageSeconds}s < interval=${pollingIntervalSec}s`);
    return json(cachedEntry.data, 200, request);
  }

  // Cache is either missing or too old
  // Check if cache exists at all (even if expired) for logging
  const existingCacheEntry = getCacheIfValid(cacheKey, Infinity);
  if (existingCacheEntry) {
    const ageSeconds = Math.floor((Date.now() - existingCacheEntry.cachedAt) / 1000);
    console.log(`Cache expired for news ${normalizedSymbol}: age=${ageSeconds}s >= interval=${pollingIntervalSec}s, fetching fresh data`);
  } else {
    console.log(`No cache for news ${normalizedSymbol}, fetching fresh data`);
  }

  // Check if provider failure simulation is enabled
  if (config.featureFlags.simulateProviderFailure) {
    // Simulation mode: return empty array (no news available)
    const simulationResponse = { 
      symbol: normalizedSymbol,
      news: [],
      cached: false,
      stale: true,
      stale_reason: "simulation_mode"
    };
    return json(simulationResponse, 200, request);
  }

  // Normal flow: fetch from provider
  try {
    // Fetch news from FMP API
    // Using /stable/news/stock?symbols=AAPL format
    const newsApi = `${API_URL}/news/stock?symbols=${normalizedSymbol}&apikey=${API_KEY}`;
    const newsRes = await fetch(newsApi, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!newsRes.ok) {
      // Provider failed - return empty array gracefully
      console.warn(`Provider API failed for news ${normalizedSymbol}: HTTP ${newsRes.status}`);
      const errorResponse = {
        symbol: normalizedSymbol,
        news: [],
        cached: false,
        stale: true,
        stale_reason: "provider_api_error"
      };
      return json(errorResponse, 200, request);
    }

    const newsData = await newsRes.json();
    
    // Check for FMP API error messages
    if (newsData && typeof newsData === 'object' && ('Error Message' in newsData || 'error' in newsData)) {
      console.warn(`Provider API returned error for news ${normalizedSymbol}`);
      const errorResponse = {
        symbol: normalizedSymbol,
        news: [],
        cached: false,
        stale: true,
        stale_reason: "provider_invalid_data"
      };
      return json(errorResponse, 200, request);
    }

    // Normalize news data
    const news = Array.isArray(newsData) ? newsData : (newsData ? [newsData] : []);
    
    const normalizedNews: StockNewsItem[] = news.map((item: any) => ({
      title: item.title || "",
      text: item.text || item.description || "",
      url: item.url || item.link || "",
      publishedDate: item.publishedDate || item.date || "",
      image: item.image,
      source: item.site || item.source,
    }));

    // Build response object
    const newsResponse = {
      symbol: normalizedSymbol,
      news: normalizedNews,
      cached: false,
      refreshedAt: Date.now(),
    };

    // Cache the result (using polling interval + 5 seconds for TTL)
    setCache(cacheKey, newsResponse, pollingIntervalSec + 5);

    return json(newsResponse, 200, request);
  } catch (err) {
    console.error(`Error fetching news for ${normalizedSymbol}:`, err);

    // Provider failure (network error, timeout, etc.) - return empty array gracefully
    if (err instanceof Error && (
      err.message.includes('fetch') ||
      err.message.includes('network') ||
      err.message.includes('timeout') ||
      err.message.includes('Failed to fetch')
    )) {
      console.warn(`Provider network error for news ${normalizedSymbol}:`, err.message);
      const errorResponse = {
        symbol: normalizedSymbol,
        news: [],
        cached: false,
        stale: true,
        stale_reason: "provider_network_error"
      };
      return json(errorResponse, 200, request);
    }

    // Unknown error
    return json({ error: "Failed to fetch stock news", symbol: normalizedSymbol }, 500, request);
  }
}

