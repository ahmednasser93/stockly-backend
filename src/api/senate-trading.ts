/**
 * FMP API integration for Senate Trading data
 * Fetches trading disclosures from US Senate and House members
 */

import type { Env } from "../index";
import { API_KEY, API_URL } from "../util";
import { mapFmpResponseToTrade } from "../senate-trading/models";
import { mapFmpResponseToHouseTrade } from "../house-trading/models";
import type { SenateTrade } from "../senate-trading/types";
import type { HouseTrade } from "../house-trading/types";

/**
 * Fetch senate trading data from FMP API
 * Endpoint: GET /stable/senate-latest (for latest trades with pagination)
 * Endpoint: GET /stable/senate-trades?symbol={symbol} (for trades by symbol)
 * 
 * @param symbol - Optional stock symbol to filter by
 * @param env - Cloudflare Workers environment with FMP_API_KEY
 * @param page - Optional page number for pagination (default: 0)
 * @param limit - Optional limit for pagination (default: 100)
 * @returns Array of SenateTrade records
 */
export async function fetchSenateTradingFromFmp(
  symbol: string | undefined,
  env: Env,
  page: number = 0,
  limit: number = 100
): Promise<SenateTrade[]> {
  try {
    // Use env.FMP_API_KEY if available, otherwise fall back to hardcoded API_KEY
    const apiKey = env.FMP_API_KEY ?? API_KEY;

    // Build API URL - use different endpoints based on whether symbol is provided
    let apiUrl: string;
    if (symbol) {
      // Use /stable/senate-trades?symbol={symbol} for symbol-specific queries
      const normalizedSymbol = symbol.trim().toUpperCase();
      apiUrl = `${API_URL}/senate-trades?symbol=${normalizedSymbol}&apikey=${apiKey}`;
    } else {
      // Use /stable/senate-latest with pagination for latest trades
      apiUrl = `${API_URL}/senate-latest?page=${page}&limit=${limit}&apikey=${apiKey}`;
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
 * Fetch House trading data from FMP API
 * Endpoint: GET /stable/house-latest (for latest trades with pagination)
 * 
 * @param env - Cloudflare Workers environment with FMP_API_KEY
 * @param page - Optional page number for pagination (default: 0)
 * @param limit - Optional limit for pagination (default: 100)
 * @returns Array of HouseTrade records (uses same structure as SenateTrade)
 */
export async function fetchHouseTradingFromFmp(
  env: Env,
  page: number = 0,
  limit: number = 100
): Promise<HouseTrade[]> {
  try {
    const apiKey = env.FMP_API_KEY ?? API_KEY;
    const apiUrl = `${API_URL}/house-latest?page=${page}&limit=${limit}&apikey=${apiKey}`;

    console.log(`[fetchHouseTradingFromFmp] Fetching from: ${apiUrl.replace(apiKey, "***")}`);

    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      
      if (response.status === 429) {
        console.warn(`[fetchHouseTradingFromFmp] Rate limited by FMP API. Response: ${errorText.substring(0, 200)}`);
        throw new Error(`FMP API rate limit exceeded. Please try again later.`);
      }
      
      if (response.status === 401 || response.status === 403) {
        console.error(`[fetchHouseTradingFromFmp] Authentication failed: HTTP ${response.status}`);
        throw new Error(`FMP API authentication failed. Please check API key.`);
      }
      
      if (response.status >= 500) {
        console.error(`[fetchHouseTradingFromFmp] FMP API server error: HTTP ${response.status}`);
        throw new Error(`FMP API server error. Please try again later.`);
      }
      
      console.error(
        `[fetchHouseTradingFromFmp] Failed to fetch house trading data: HTTP ${response.status}. Response: ${errorText.substring(0, 200)}`
      );
      throw new Error(`FMP API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    let trades: any[] = [];
    if (Array.isArray(data)) {
      trades = data;
    } else if (data && typeof data === "object") {
      if (Array.isArray(data.data)) {
        trades = data.data;
      } else if (Array.isArray(data.results)) {
        trades = data.results;
      } else if (Array.isArray(data.trades)) {
        trades = data.trades;
      } else {
        console.warn("[fetchHouseTradingFromFmp] Unexpected response format:", Object.keys(data));
        trades = [];
      }
    }

    console.log(`[fetchHouseTradingFromFmp] Received ${trades.length} trades from FMP API`);

    const mappedTrades: HouseTrade[] = [];
    for (const tradeData of trades) {
      const trade = mapFmpResponseToHouseTrade(tradeData);
      if (trade) {
        mappedTrades.push(trade);
      }
    }

    console.log(`[fetchHouseTradingFromFmp] Successfully mapped ${mappedTrades.length} trades`);

    return mappedTrades;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error("[fetchHouseTradingFromFmp] Network error:", error);
      throw new Error("Network error while fetching house trading data. Please check your connection.");
    }
    
    if (error instanceof Error && error.name === 'AbortError') {
      console.error("[fetchHouseTradingFromFmp] Request timeout");
      throw new Error("Request timeout while fetching house trading data. Please try again.");
    }
    
    if (error instanceof Error && error.message.includes('FMP API')) {
      throw error;
    }
    
    console.error("[fetchHouseTradingFromFmp] Unexpected error fetching house trading data:", error);
    throw new Error("Failed to fetch house trading data. Please try again later.");
  }
}

/**
 * Fetch senate trades by senator name from FMP API
 * Endpoint: GET /stable/senate-trades-by-name?name={name}&apikey={key}
 * Used for autocomplete/search functionality
 * 
 * @param name - Senator name (partial match supported)
 * @param env - Cloudflare Workers environment with FMP_API_KEY
 * @returns Array of SenateTrade records
 */
export async function fetchSenateTradesByName(
  name: string,
  env: Env
): Promise<SenateTrade[]> {
  try {
    const apiKey = env.FMP_API_KEY ?? API_KEY;
    const apiUrl = `${API_URL}/senate-trades-by-name?name=${encodeURIComponent(name)}&apikey=${apiKey}`;

    console.log(`[fetchSenateTradesByName] Fetching from: ${apiUrl.replace(apiKey, "***")}`);

    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      
      // Handle rate limiting (429)
      if (response.status === 429) {
        console.warn(`[fetchSenateTradesByName] Rate limited by FMP API. Response: ${errorText.substring(0, 200)}`);
        throw new Error(`FMP API rate limit exceeded. Please try again later.`);
      }
      
      // Handle authentication errors (401, 403)
      if (response.status === 401 || response.status === 403) {
        console.error(`[fetchSenateTradesByName] Authentication failed: HTTP ${response.status}`);
        throw new Error(`FMP API authentication failed. Please check API key.`);
      }
      
      // Handle server errors (5xx)
      if (response.status >= 500) {
        console.error(`[fetchSenateTradesByName] FMP API server error: HTTP ${response.status}`);
        throw new Error(`FMP API server error. Please try again later.`);
      }
      
      console.error(
        `[fetchSenateTradesByName] Failed to fetch senate trades by name: HTTP ${response.status}. Response: ${errorText.substring(0, 200)}`
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
        console.warn("[fetchSenateTradesByName] Unexpected response format:", Object.keys(data));
        trades = [];
      }
    }

    console.log(`[fetchSenateTradesByName] Received ${trades.length} trades from FMP API`);

    // Map FMP responses to domain models
    const mappedTrades: SenateTrade[] = [];
    for (const tradeData of trades) {
      const trade = mapFmpResponseToTrade(tradeData);
      if (trade) {
        mappedTrades.push(trade);
      }
    }

    console.log(`[fetchSenateTradesByName] Successfully mapped ${mappedTrades.length} trades`);

    return mappedTrades;
  } catch (error) {
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error("[fetchSenateTradesByName] Network error:", error);
      throw new Error("Network error while fetching senate trading data. Please check your connection.");
    }
    
    // Handle timeout errors
    if (error instanceof Error && error.name === 'AbortError') {
      console.error("[fetchSenateTradesByName] Request timeout");
      throw new Error("Request timeout while fetching senate trading data. Please try again.");
    }
    
    // Re-throw if already a custom error
    if (error instanceof Error && error.message.includes('FMP API')) {
      throw error;
    }
    
    console.error("[fetchSenateTradesByName] Unexpected error fetching senate trades by name:", error);
    throw new Error("Failed to fetch senate trading data. Please try again later.");
  }
}

