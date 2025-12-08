import type { Env } from "../index";
import { API_KEY, API_URL } from "../util";

/**
 * Fetches historical price data from FMP API and saves to D1 database
 * Uses UPSERT logic to update existing records or insert new ones
 * 
 * @param symbol - Stock ticker symbol (e.g., "AAPL")
 * @param env - Cloudflare Workers environment with D1 database
 * @param ctx - Execution context for async operations
 * @param fromDate - Optional start date for date range (YYYY-MM-DD format)
 * @param toDate - Optional end date for date range (YYYY-MM-DD format)
 */
export async function fetchAndSaveHistoricalPrice(
  symbol: string,
  env: Env,
  ctx: ExecutionContext,
  fromDate?: string,
  toDate?: string
): Promise<void> {
  try {
    const normalizedSymbol = symbol.trim().toUpperCase();

    // Use env.FMP_API_KEY if available, otherwise fall back to hardcoded API_KEY from util.ts
    const apiKey = env.FMP_API_KEY ?? API_KEY;

    console.log(`[fetchAndSaveHistoricalPrice] Starting fetch for ${normalizedSymbol} from FMP API`);

    // Fetch historical data from FMP API using 30minpoint with OHLC
    // The 30min returns array directly with OHLC data: [{ date, open, high, low, close, volume }, ...]
    // URL format: /historical-chart/30minbol=SYMBOL&apikey=KEY&from=YYYY-MM-DD&to=YYYY-MM-DD
    let apiUrl = `${API_URL}/historical-chart/30min?symbol=${normalizedSymbol}&apikey=${apiKey}`;
    
    // Add date range parameters if provided
    if (fromDate) {
      apiUrl += `&from=${fromDate}`;
    }
    if (toDate) {
      apiUrl += `&to=${toDate}`;
    }
    
    console.log(`[fetchAndSaveHistoricalPrice] Fetching from: ${apiUrl.replace(apiKey, '***')}`);
    let response = await fetch(apiUrl);
    let hasOHLC = true; // 1-hour endpoint provides OHLC data

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(`Failed to fetch historical prices for ${normalizedSymbol}: HTTP ${response.status}. Response: ${errorText.substring(0, 200)}`);
      return;
    }

    const data = await response.json();

    // Check for FMP API error messages
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if ('Error Message' in data || 'error' in data || data['Error Message']) {
        const errorMsg = data['Error Message'] || data.error || JSON.stringify(data);
        console.error(`[fetchAndSaveHistoricalPrice] FMP API returned error for ${normalizedSymbol}: ${errorMsg}`);
        return;
      }
      // Check for subscription errors or rate limits
      if (data.message && typeof data.message === 'string' && (data.message.toLowerCase().includes('subscription') || data.message.toLowerCase().includes('limit'))) {
        console.error(`[fetchAndSaveHistoricalPrice] FMP API subscription/limit error for ${normalizedSymbol}: ${data.message}`);
        return;
      }
    }

    // FMP API 1-hour endpoint returns array directly: [{ date, open, high, low, close, volume }, ...]
    let records: any[] = [];
    if (Array.isArray(data)) {
      // 1-hour endpoint returns array directly with OHLC data
      records = data;
      hasOHLC = true;
      console.log(`[fetchAndSaveHistoricalPrice] Received ${records.length} 1-hour OHLC records from FMP API`);
    } else if (data.historical && Array.isArray(data.historical)) {
      // Fallback: daily endpoint format
      records = data.historical;
      hasOHLC = true;
      console.log(`[fetchAndSaveHistoricalPrice] Received ${records.length} daily OHLC records from FMP API (historical format)`);
    } else if (data) {
      records = [data];
      hasOHLC = data.open !== undefined && data.high !== undefined && data.low !== undefined;
      console.log(`[fetchAndSaveHistoricalPrice] Received single record from FMP API`);
    }

    console.log(`[fetchAndSaveHistoricalPrice] FMP API returned ${records.length} records for ${normalizedSymbol}`);

    if (records.length === 0) {
      console.warn(`[fetchAndSaveHistoricalPrice] No historical price data returned for ${normalizedSymbol} from FMP API`);
      return;
    }

    // Log sample record to verify OHLC data structure
    if (records.length > 0) {
      const sampleRecord = records[0];
      console.log(`[fetchAndSaveHistoricalPrice] Sample record structure:`, {
        date: sampleRecord.date,
        hasOpen: typeof sampleRecord.open === 'number',
        hasHigh: typeof sampleRecord.high === 'number',
        hasLow: typeof sampleRecord.low === 'number',
        hasClose: typeof sampleRecord.close === 'number',
        hasPrice: typeof sampleRecord.price === 'number',
        keys: Object.keys(sampleRecord),
      });
    }

    // Sort records chronologically to ensure proper OHLC aggregation
    // First hour of the day sets the open, last hour sets the close
    records.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });

    // Aggregate 1-hour data into daily candles
    // The 1-hour endpoint returns timestamps like "2024-01-01 09:30:00"
    // We need to group by date (YYYY-MM-DD) and create daily OHLC candles
    const dailyCandles = new Map<string, {
      open: number | null;
      high: number | null;
      low: number | null;
      close: number | null;
      volume: number;
      date: string; // YYYY-MM-DD format
    }>();

    for (const record of records) {
      // 1-hour endpoint returns: { date: "2024-01-01 09:30:00", open: 100, high: 105, low: 99, close: 103, volume: 1000000 }
      const timestamp = record.date; // e.g., "2024-01-01 09:30:00" or "2024-01-01T09:30:00"
      const price = typeof record.price === 'number' ? record.price :
        typeof record.close === 'number' ? record.close : null;
      const volume = typeof record.volume === 'number' ? Math.round(record.volume) : null;

      // Extract OHLC data from 1-hour record
      let open = typeof record.open === 'number' ? record.open : null;
      let high = typeof record.high === 'number' ? record.high : null;
      let low = typeof record.low === 'number' ? record.low : null;
      const close = price; // Closing price for this hour

      // Parse timestamp to extract date (YYYY-MM-DD)
      let dateStr: string;
      try {
        // Handle both "2024-01-01 09:30:00" and ISO format "2024-01-01T09:30:00"
        const dateObj = new Date(timestamp);
        if (isNaN(dateObj.getTime())) {
          // Try parsing as date string directly
          dateStr = timestamp.split(' ')[0].split('T')[0];
        } else {
          dateStr = dateObj.toISOString().split('T')[0];
        }
      } catch (e) {
        console.warn(`[fetchAndSaveHistoricalPrice] Failed to parse date from timestamp ${timestamp}, skipping record`);
        continue;
      }

      // Skip if we don't have valid price data
      if (!dateStr || close === null) {
        console.warn(`[fetchAndSaveHistoricalPrice] Skipping invalid historical record for ${normalizedSymbol}: missing date or price`);
        continue;
      }

      // If OHLC data is missing from 1-hour record, use close as fallback
      if (open == null) open = close;
      if (high == null) high = close;
      if (low == null) low = close;

      // Aggregate into daily candle
      if (!dailyCandles.has(dateStr)) {
        dailyCandles.set(dateStr, {
          open: null, // Will be set to first hour's open
          high: null,
          low: null,
          close: null, // Will be set to last hour's close
          volume: 0,
          date: dateStr,
        });
      }

      const candle = dailyCandles.get(dateStr)!;
      
      // First hour of the day sets the open
      if (candle.open === null) {
        candle.open = open;
      }
      
      // Track highest high and lowest low
      if (candle.high === null || high! > candle.high) {
        candle.high = high;
      }
      if (candle.low === null || low! < candle.low) {
        candle.low = low;
      }
      
      // Last hour of the day sets the close (will be overwritten by later hours)
      candle.close = close;
      
      // Sum volumes
      if (volume !== null) {
        candle.volume += volume;
      }
    }

    // Insert aggregated daily candles into database
    for (const [dateStr, candle] of dailyCandles.entries()) {
      // Only update OHLC if we have valid OHLC data (not null)
      const hasValidOHLC = candle.open !== null && candle.high !== null && candle.low !== null;

      if (hasValidOHLC) {
        // UPSERT: Use INSERT OR REPLACE to update existing records with OHLC data
        // Note: 'price' column stores closing price, which acts as 'close' in OHLC context
        try {
          await env.stockly
            .prepare(
              `INSERT OR REPLACE INTO historical_prices (symbol, date, price, volume, open, high, low)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(normalizedSymbol, candle.date, candle.close, candle.volume, candle.open, candle.high, candle.low)
            .run();
          console.log(`[fetchAndSaveHistoricalPrice] Saved daily candle for ${normalizedSymbol} on ${candle.date} with OHLC: open=${candle.open}, high=${candle.high}, low=${candle.low}, close=${candle.close}`);
        } catch (dbError: any) {
          // If insert fails (e.g., missing columns), try without OHLC columns as fallback
          console.warn(`[fetchAndSaveHistoricalPrice] Insert with OHLC failed for ${normalizedSymbol} on ${candle.date}, trying fallback without OHLC:`, dbError?.message);
          try {
            await env.stockly
              .prepare(
                `INSERT OR REPLACE INTO historical_prices (symbol, date, price, volume)
                 VALUES (?, ?, ?, ?)`
              )
              .bind(normalizedSymbol, candle.date, candle.close, candle.volume)
              .run();
          } catch (fallbackError: any) {
            console.error(`[fetchAndSaveHistoricalPrice] Failed to insert historical record for ${normalizedSymbol} on ${candle.date}:`, fallbackError?.message);
            // Continue with next record instead of failing completely
          }
        }
      } else {
        // If we don't have valid OHLC, use UPDATE to only update OHLC columns if record exists
        // This avoids overwriting existing records with null OHLC values
        console.warn(`[fetchAndSaveHistoricalPrice] Skipping OHLC update for ${normalizedSymbol} on ${candle.date} - missing OHLC data (open=${candle.open}, high=${candle.high}, low=${candle.low})`);
        // Still update price and volume if record exists
        try {
          await env.stockly
            .prepare(
              `INSERT OR REPLACE INTO historical_prices (symbol, date, price, volume)
               VALUES (?, ?, ?, ?)`
            )
            .bind(normalizedSymbol, candle.date, candle.close, candle.volume)
            .run();
        } catch (fallbackError: any) {
          console.error(`[fetchAndSaveHistoricalPrice] Failed to insert historical record for ${normalizedSymbol} on ${candle.date}:`, fallbackError?.message);
        }
      }
    }

    console.log(`Saved ${dailyCandles.size} daily candles (aggregated from ${records.length} 1-hour records) for ${normalizedSymbol} with OHLC data`);
  } catch (error) {
    // Log error but don't throw - this is a background operation
    console.error(`Error fetching/saving historical prices for ${symbol}:`, error);
  }
}

/**
 * Get historical price data from D1 database by date range
 * 
 * @param symbol - Stock ticker symbol (e.g., "AAPL")
 * @param fromDate - Start date (inclusive)
 * @param toDate - End date (inclusive)
 * @param env - Cloudflare Workers environment with D1 database
 */
export async function getHistoricalPricesByDateRange(
  symbol: string,
  fromDate: Date,
  toDate: Date,
  env: Env
): Promise<{ date: string; price: number; volume: number | null; open: number | null; high: number | null; low: number | null; close: number | null }[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();

  // Format dates as YYYY-MM-DD strings
  const fromDateStr = fromDate.toISOString().split('T')[0];
  const toDateStr = toDate.toISOString().split('T')[0];

  try {
    console.log(`[getHistoricalPricesByDateRange] Querying database for ${normalizedSymbol} from ${fromDateStr} to ${toDateStr}`);

    // Try querying with OHLC columns first, fallback to basic columns if they don't exist
    let result;
    try {
      result = await env.stockly
        .prepare(
          `SELECT date, price, volume, open, high, low
           FROM historical_prices
           WHERE symbol = ? AND date >= ? AND date <= ?
           ORDER BY date ASC`
        )
        .bind(normalizedSymbol, fromDateStr, toDateStr)
        .all<{ date: string; price: number; volume: number | null; open: number | null; high: number | null; low: number | null }>();
    } catch (queryError: any) {
      // If OHLC columns don't exist, try querying without them
      console.warn(`[getHistoricalPricesByDateRange] Query with OHLC columns failed, trying fallback: ${queryError?.message}`);
      result = await env.stockly
        .prepare(
          `SELECT date, price, volume
           FROM historical_prices
           WHERE symbol = ? AND date >= ? AND date <= ?
           ORDER BY date ASC`
        )
        .bind(normalizedSymbol, fromDateStr, toDateStr)
        .all<{ date: string; price: number; volume: number | null }>();
    }

    const records = (result.results ?? []).map((row: any) => ({
      date: row.date,
      price: row.price, // Closing price (backward compatibility)
      close: row.price, // 'price' column represents closing price, use as 'close' alias
      volume: row.volume ?? null,
      open: row.open ?? null,
      high: row.high ?? null,
      low: row.low ?? null,
    }));

    console.log(`[getHistoricalPricesByDateRange] Found ${records.length} records for ${normalizedSymbol} in date range ${fromDateStr} to ${toDateStr}`);
    return records;
  } catch (error: any) {
    console.error(`[getHistoricalPricesByDateRange] Error querying historical prices from database for ${normalizedSymbol}:`, error?.message || error);
    return [];
  }
}

/**
 * Get historical price data from D1 database by days
 * 
 * @param symbol - Stock ticker symbol (e.g., "AAPL")
 * @param days - Number of days to look back (default: 180)
 * @param env - Cloudflare Workers environment with D1 database
 * @deprecated Use getHistoricalPricesByDateRange instead
 */
export async function getHistoricalPrices(
  symbol: string,
  days: number,
  env: Env
): Promise<{ date: string; price: number; volume: number | null; open: number | null; high: number | null; low: number | null; close: number | null }[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();

  // Calculate cutoff date (days ago from today)
  const today = new Date();
  const cutoffDate = new Date(today);
  cutoffDate.setDate(today.getDate() - days);

  return getHistoricalPricesByDateRange(normalizedSymbol, cutoffDate, today, env);
}

