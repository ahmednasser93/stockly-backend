import type { Env } from "../index";
import { API_KEY, API_URL } from "../util";

/**
 * Fetches historical price data from FMP API and saves to D1 database
 * Uses UPSERT logic to update existing records or insert new ones
 * 
 * @param symbol - Stock ticker symbol (e.g., "AAPL")
 * @param env - Cloudflare Workers environment with D1 database
 * @param ctx - Execution context for async operations
 */
export async function fetchAndSaveHistoricalPrice(
  symbol: string,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  try {
    const normalizedSymbol = symbol.trim().toUpperCase();
    
    // Use env.FMP_API_KEY if available, otherwise fall back to hardcoded API_KEY from util.ts
    const apiKey = env.FMP_API_KEY ?? API_KEY;
    
    // Fetch historical data from FMP API
    const apiUrl = `${API_URL}/historical-price-eod/light?symbol=${normalizedSymbol}&apikey=${apiKey}`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.warn(`Failed to fetch historical prices for ${normalizedSymbol}: ${response.status}`);
      return;
    }
    
    const data = await response.json();
    
    // Handle both array and single object responses
    const records = Array.isArray(data) ? data : (data ? [data] : []);
    
    if (records.length === 0) {
      console.warn(`No historical price data returned for ${normalizedSymbol}`);
      return;
    }
    
    // Use batch insert for better performance
    // SQLite doesn't support INSERT ... ON CONFLICT in D1 the same way, so we'll do individual upserts
    // We use INSERT OR REPLACE which matches the existing pattern for alerts/price cache
    for (const record of records) {
      const date = record.date;
      const price = typeof record.price === 'number' ? record.price : null;
      const volume = typeof record.volume === 'number' ? Math.round(record.volume) : null;
      
      // Validate required fields
      if (!date || price === null) {
        console.warn(`Skipping invalid historical record for ${normalizedSymbol}: missing date or price`);
        continue;
      }
      
      // UPSERT: Use INSERT OR REPLACE to match existing patterns (similar to alerts table)
      await env.stockly
        .prepare(
          `INSERT OR REPLACE INTO historical_prices (symbol, date, price, volume)
           VALUES (?, ?, ?, ?)`
        )
        .bind(normalizedSymbol, date, price, volume)
        .run();
    }
    
    console.log(`Saved ${records.length} historical price records for ${normalizedSymbol}`);
  } catch (error) {
    // Log error but don't throw - this is a background operation
    console.error(`Error fetching/saving historical prices for ${symbol}:`, error);
  }
}

/**
 * Get historical price data from D1 database
 * 
 * @param symbol - Stock ticker symbol (e.g., "AAPL")
 * @param days - Number of days to look back (default: 180)
 * @param env - Cloudflare Workers environment with D1 database
 */
export async function getHistoricalPrices(
  symbol: string,
  days: number,
  env: Env
): Promise<{ date: string; price: number; volume: number | null }[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  
  // Calculate cutoff date (days ago from today)
  const today = new Date();
  const cutoffDate = new Date(today);
  cutoffDate.setDate(today.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD format
  
  const result = await env.stockly
    .prepare(
      `SELECT date, price, volume
       FROM historical_prices
       WHERE symbol = ? AND date >= ?
       ORDER BY date ASC`
    )
    .bind(normalizedSymbol, cutoffDateStr)
    .all<{ date: string; price: number; volume: number | null }>();
  
  return (result.results ?? []).map((row) => ({
    date: row.date,
    price: row.price,
    volume: row.volume,
  }));
}

