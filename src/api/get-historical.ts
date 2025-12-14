import type { Env } from "../index";
import { json } from "../util";
import { getHistoricalPricesByDateRange, fetchAndSaveHistoricalPrice } from "./historical-prices";

/**
 * Parse date string in YYYY-MM-DD format
 */
function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Format date as YYYY-MM-DD string
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

import type { Logger } from "../logging/logger";

export async function getHistorical(request: Request, url: URL, env: Env, ctx: ExecutionContext | undefined, logger: Logger): Promise<Response> {
  const symbol = url.searchParams.get("symbol");
  const daysParam = url.searchParams.get("days");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  if (!symbol) {
    return json({ error: "symbol parameter is required" }, 400, request);
  }

  const normalizedSymbol = symbol.trim().toUpperCase();

  // Parse date range parameters
  let fromDate: Date | null = null;
  let toDate: Date | null = null;
  let days: number | null = null;

  // Priority: from/to parameters take precedence over days
  if (fromParam || toParam) {
    if (fromParam) {
      fromDate = parseDate(fromParam);
      if (!fromDate) {
        return json({ error: "Invalid 'from' date format (expected YYYY-MM-DD)" }, 400, request);
      }
    }
    if (toParam) {
      toDate = parseDate(toParam);
      if (!toDate) {
        return json({ error: "Invalid 'to' date format (expected YYYY-MM-DD)" }, 400, request);
      }
    }

    // Validate date range
    if (fromDate && toDate && fromDate > toDate) {
      return json({ error: "'from' date must be before or equal to 'to' date" }, 400, request);
    }

    // Set defaults if only one date is provided
    if (!toDate) {
      toDate = new Date(); // Default to today
    }
    if (!fromDate) {
      // Default to 180 days ago if only 'to' is provided
      fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - 180);
    }
  } else if (daysParam) {
    // Use days parameter for backward compatibility
    const parsedDays = parseInt(daysParam, 10);
    if (!isNaN(parsedDays) && parsedDays > 0 && parsedDays <= 3650) {
      days = parsedDays;
      toDate = new Date();
      fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - days);
    } else {
      return json({ error: "days parameter must be a positive number between 1 and 3650" }, 400, request);
    }
  } else {
    // Default to 180 days if no parameters provided
    days = 180;
    toDate = new Date();
    fromDate = new Date(toDate);
    fromDate.setDate(fromDate.getDate() - days);
  }

  try {
    // First, try to get data from database using date range
    let data = await getHistoricalPricesByDateRange(normalizedSymbol, fromDate!, toDate!, env);

    console.log(`[get-historical] Query result for ${normalizedSymbol} (${formatDate(fromDate!)} to ${formatDate(toDate!)}): ${data.length} records found in database`);

    // Check if OHLC data is missing (null or undefined) in existing records
    // This happens when old data was inserted before the OHLC aggregation fix
    const hasMissingOHLC = data.length > 0 && data.some(record =>
      (record.open === null || record.open === undefined) ||
      (record.high === null || record.high === undefined) ||
      (record.low === null || record.low === undefined)
    );

    // If database is empty OR has missing OHLC data, fetch from FMP API to populate/update
    if (data.length === 0 || hasMissingOHLC) {
      if (hasMissingOHLC) {
        const recordsWithMissingOHLC = data.filter(r =>
          (r.open === null || r.open === undefined) ||
          (r.high === null || r.high === undefined) ||
          (r.low === null || r.low === undefined)
        ).length;
        logger.warn(`Found ${recordsWithMissingOHLC} records with missing OHLC data`, {
          symbol: normalizedSymbol,
          recordsWithMissingOHLC,
          totalRecords: data.length,
        });
      }
      logger.info(`No historical data in database for ${normalizedSymbol}`, {
        dateRange: `${formatDate(fromDate!)} to ${formatDate(toDate!)}`,
        action: "fetching from FMP API",
      });

      // Create a minimal ExecutionContext if not provided
      // This allows us to fetch data even when ctx is missing
      const effectiveCtx = ctx || {
        waitUntil: () => { }, // No-op for waitUntil if ctx is missing
        passThroughOnException: () => { },
        props: {},
      } as unknown as ExecutionContext;

      try {
        // Fetch and save historical prices synchronously with date range
        await fetchAndSaveHistoricalPrice(
          normalizedSymbol,
          env,
          effectiveCtx,
          formatDate(fromDate!),
          formatDate(toDate!)
        );

        // Wait for database write to complete (D1 writes can be async, need longer wait)
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try to get data from database again after fetching
        data = await getHistoricalPricesByDateRange(normalizedSymbol, fromDate!, toDate!, env);
        logger.debug(`After FMP fetch, query result for ${normalizedSymbol}`, {
          dateRange: `${formatDate(fromDate!)} to ${formatDate(toDate!)}`,
          recordCount: data.length,
        });

        if (data.length === 0) {
          logger.warn(`Still no data after fetching from FMP API for ${normalizedSymbol}`, {
            dateRange: `${formatDate(fromDate!)} to ${formatDate(toDate!)}`,
            possibleReasons: [
              "FMP API returned empty data",
              "FMP API returned data outside the requested date range",
              "Date range is in the future or has no trading days",
              "Database schema missing OHLC columns (check migration 009)",
            ],
          });
        } else {
          console.log(`[get-historical] Successfully fetched ${data.length} historical records for ${normalizedSymbol} from FMP API`);
        }
      } catch (fetchError: any) {
        console.error(`[get-historical] Error fetching historical data from FMP API for ${normalizedSymbol}:`, fetchError?.message || fetchError);
        // Continue with empty data - let client handle empty state
      }
    }

    // Return data even if empty (let client handle empty state gracefully)
    // This prevents 500 errors and allows UI to show appropriate message
    return json({
      symbol: normalizedSymbol,
      days: days ?? undefined,
      from: fromDate ? formatDate(fromDate) : undefined,
      to: toDate ? formatDate(toDate) : undefined,
      data,
    }, 200, request);
  } catch (error) {
  console.error(`ERROR in getHistorical for ${normalizedSymbol}:`, error);

  // Return empty array instead of 500 error for better UX
  // This allows the client to handle the empty state gracefully
  return json({
    symbol: normalizedSymbol,
    days: days ?? undefined,
    from: fromDate ? formatDate(fromDate) : undefined,
    to: toDate ? formatDate(toDate) : undefined,
    data: [],
  }, 200, request);
}
}

