/**
 * FMP API integration for Senate Trading data
 * Fetches trading disclosures from US Senate and House members
 */

import type { Env } from "../index";
import { API_KEY, API_URL } from "../util";
import { mapFmpResponseToTrade } from "../senate-trading/models";
import type { SenateTrade } from "../senate-trading/types";

/**
 * Fetch senate trading data from FMP API
 * Endpoint: GET /v4/senate-trading?symbol={symbol}&apikey={key}
 * 
 * @param symbol - Optional stock symbol to filter by
 * @param env - Cloudflare Workers environment with FMP_API_KEY
 * @returns Array of SenateTrade records
 */
export async function fetchSenateTradingFromFmp(
  symbol: string | undefined,
  env: Env
): Promise<SenateTrade[]> {
  try {
    // Use env.FMP_API_KEY if available, otherwise fall back to hardcoded API_KEY
    const apiKey = env.FMP_API_KEY ?? API_KEY;

    // Build API URL
    let apiUrl = `${API_URL}/v4/senate-trading?apikey=${apiKey}`;
    if (symbol) {
      const normalizedSymbol = symbol.trim().toUpperCase();
      apiUrl += `&symbol=${normalizedSymbol}`;
    }

    console.log(`[fetchSenateTradingFromFmp] Fetching from: ${apiUrl.replace(apiKey, "***")}`);

    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      
      // Handle rate limiting (429)
      if (response.status === 429) {
        console.warn(`[fetchSenateTradingFromFmp] Rate limited by FMP API. Response: ${errorText.substring(0, 200)}`);
        throw new Error(`FMP API rate limit exceeded. Please try again later.`);
      }
      
      // Handle authentication errors (401, 403)
      if (response.status === 401 || response.status === 403) {
        console.error(`[fetchSenateTradingFromFmp] Authentication failed: HTTP ${response.status}`);
        throw new Error(`FMP API authentication failed. Please check API key.`);
      }
      
      // Handle server errors (5xx)
      if (response.status >= 500) {
        console.error(`[fetchSenateTradingFromFmp] FMP API server error: HTTP ${response.status}`);
        throw new Error(`FMP API server error. Please try again later.`);
      }
      
      console.error(
        `[fetchSenateTradingFromFmp] Failed to fetch senate trading data: HTTP ${response.status}. Response: ${errorText.substring(0, 200)}`
      );
      throw new Error(`FMP API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // FMP API may return an array directly or an object with data property
    let trades: any[] = [];
    if (Array.isArray(data)) {
      trades = data;
    } else if (data && typeof data === "object") {
      // Handle different response formats
      if (Array.isArray(data.data)) {
        trades = data.data;
      } else if (Array.isArray(data.results)) {
        trades = data.results;
      } else if (Array.isArray(data.trades)) {
        trades = data.trades;
      } else {
        console.warn("[fetchSenateTradingFromFmp] Unexpected response format:", Object.keys(data));
        trades = [];
      }
    }

    console.log(`[fetchSenateTradingFromFmp] Received ${trades.length} trades from FMP API`);

    // Map FMP responses to domain models
    const mappedTrades: SenateTrade[] = [];
    for (const tradeData of trades) {
      const trade = mapFmpResponseToTrade(tradeData);
      if (trade) {
        mappedTrades.push(trade);
      }
    }

    console.log(`[fetchSenateTradingFromFmp] Successfully mapped ${mappedTrades.length} trades`);

    return mappedTrades;
  } catch (error) {
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error("[fetchSenateTradingFromFmp] Network error:", error);
      throw new Error("Network error while fetching senate trading data. Please check your connection.");
    }
    
    // Handle timeout errors
    if (error instanceof Error && error.name === 'AbortError') {
      console.error("[fetchSenateTradingFromFmp] Request timeout");
      throw new Error("Request timeout while fetching senate trading data. Please try again.");
    }
    
    // Re-throw if already a custom error
    if (error instanceof Error && error.message.includes('FMP API')) {
      throw error;
    }
    
    console.error("[fetchSenateTradingFromFmp] Unexpected error fetching senate trading data:", error);
    throw new Error("Failed to fetch senate trading data. Please try again later.");
  }
}

/**
 * Fetch senate trading data from FMP RSS feed (if available)
 * Endpoint: GET /v4/senate-trading-rss?apikey={key}
 * 
 * Note: RSS endpoint may not be available, this is a placeholder for future implementation
 * 
 * @param env - Cloudflare Workers environment with FMP_API_KEY
 * @returns Array of SenateTrade records
 */
export async function fetchSenateTradingRss(env: Env): Promise<SenateTrade[]> {
  try {
    const apiKey = env.FMP_API_KEY ?? API_KEY;
    const apiUrl = `${API_URL}/v4/senate-trading-rss?apikey=${apiKey}`;

    console.log(`[fetchSenateTradingRss] Fetching from: ${apiUrl.replace(apiKey, "***")}`);

    const response = await fetch(apiUrl);

    if (!response.ok) {
      // RSS endpoint may not exist, fall back to regular endpoint
      console.warn(
        `[fetchSenateTradingRss] RSS endpoint not available (${response.status}), falling back to regular endpoint`
      );
      return fetchSenateTradingFromFmp(undefined, env);
    }

    // Parse RSS feed (simplified - would need proper RSS parser in production)
    const text = await response.text();
    console.log(`[fetchSenateTradingRss] Received RSS feed (${text.length} chars)`);

    // For now, fall back to regular endpoint
    // In production, implement proper RSS parsing
    return fetchSenateTradingFromFmp(undefined, env);
  } catch (error) {
    console.error("[fetchSenateTradingRss] Error fetching RSS feed:", error);
    // Fall back to regular endpoint on error
    return fetchSenateTradingFromFmp(undefined, env);
  }
}

