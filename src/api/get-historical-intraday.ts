import type { Env } from "../index";
import { json } from "../util";
import { API_KEY, API_URL } from "../util";

/**
 * Parse interval string to minutes
 * @param interval - Interval string (e.g., "1h", "4h", "30m")
 * @returns Number of minutes
 */
function parseIntervalToMinutes(interval: string): number {
    const match = interval.match(/^(\d+)([hm])$/);
    if (!match) {
        throw new Error(`Invalid interval format: ${interval}. Expected format: "1h", "4h", "30m", etc.`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    if (unit === 'h') {
        return value * 60;
    } else if (unit === 'm') {
        return value;
    }

    throw new Error(`Invalid interval unit: ${unit}. Expected 'h' or 'm'.`);
}

/**
 * Round timestamp down to interval boundary
 * @param timestamp - Date to round
 * @param intervalMinutes - Interval in minutes
 * @returns Rounded date
 */
function roundToIntervalBoundary(timestamp: Date, intervalMinutes: number): Date {
    const ms = timestamp.getTime();
    const intervalMs = intervalMinutes * 60 * 1000;
    const roundedMs = Math.floor(ms / intervalMs) * intervalMs;
    return new Date(roundedMs);
}

/**
 * Aggregate 30-minute OHLC data into specified interval
 * @param data - Array of 30-minute candles
 * @param interval - Target interval (e.g., "4h", "1h")
 * @returns Array of aggregated candles
 */
function aggregateToInterval(
    data: Array<{
        date: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
    }>,
    interval: string
): Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}> {
    if (data.length === 0) return [];

    const intervalMinutes = parseIntervalToMinutes(interval);
    const candles = new Map<string, {
        date: string;
        open: number | null;
        high: number | null;
        low: number | null;
        close: number | null;
        volume: number;
        timestamp: number;
    }>();

    // Sort data by date (oldest first) to ensure proper aggregation
    const sortedData = [...data].sort((a, b) => {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    for (const record of sortedData) {
        const timestamp = new Date(record.date);
        const intervalStart = roundToIntervalBoundary(timestamp, intervalMinutes);
        const key = intervalStart.toISOString();

        if (!candles.has(key)) {
            candles.set(key, {
                date: key,
                open: null,
                high: null,
                low: null,
                close: null,
                volume: 0,
                timestamp: intervalStart.getTime(),
            });
        }

        const candle = candles.get(key)!;

        // First record in interval sets the open
        if (candle.open === null) {
            candle.open = record.open;
        }

        // Track highest high
        if (candle.high === null || record.high > candle.high) {
            candle.high = record.high;
        }

        // Track lowest low
        if (candle.low === null || record.low < candle.low) {
            candle.low = record.low;
        }

        // Last record in interval sets the close
        candle.close = record.close;

        // Sum volumes
        candle.volume += record.volume;
    }

    // Convert to array and sort by timestamp
    return Array.from(candles.values())
        .filter(c => c.open !== null && c.high !== null && c.low !== null && c.close !== null)
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(c => ({
            date: c.date,
            open: c.open!,
            high: c.high!,
            low: c.low!,
            close: c.close!,
            volume: c.volume,
        }));
}

/**
 * Fetch 30-minute data from FMP API
 * @param symbol - Stock symbol
 * @param fromDate - Start date (YYYY-MM-DD)
 * @param toDate - End date (YYYY-MM-DD)
 * @param env - Environment with API key
 * @returns Array of 30-minute candles
 */
async function fetch30MinuteData(
    symbol: string,
    fromDate: string,
    toDate: string,
    env: Env
): Promise<Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}>> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const apiKey = env.FMP_API_KEY ?? API_KEY;

    const apiUrl = `${API_URL}/historical-chart/30min?symbol=${normalizedSymbol}&apikey=${apiKey}&from=${fromDate}&to=${toDate}`;

    console.log(`[fetch30MinuteData] Fetching 30-min data for ${normalizedSymbol} from ${fromDate} to ${toDate}`);

    const response = await fetch(apiUrl);

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[fetch30MinuteData] HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        throw new Error(`Failed to fetch 30-minute data: HTTP ${response.status}`);
    }

    const data = await response.json();

    // Check for API errors
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        const errorData = data as Record<string, any>;
        if ('Error Message' in errorData || 'error' in errorData) {
            const errorMsg = errorData['Error Message'] || errorData.error || JSON.stringify(data);
            console.error(`[fetch30MinuteData] FMP API error: ${errorMsg}`);
            throw new Error(`FMP API error: ${errorMsg}`);
        }
    }

    if (!Array.isArray(data)) {
        console.error(`[fetch30MinuteData] Expected array, got: ${typeof data}`);
        return [];
    }

    console.log(`[fetch30MinuteData] Received ${data.length} 30-minute candles`);

    // Filter out invalid records
    return data.filter(record =>
        record.date &&
        typeof record.open === 'number' &&
        typeof record.high === 'number' &&
        typeof record.low === 'number' &&
        typeof record.close === 'number' &&
        typeof record.volume === 'number'
    );
}

/**
 * Format date as YYYY-MM-DD string
 */
function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

/**
 * Get historical intraday data with custom intervals
 * Endpoint: /api/historical-intraday?symbol=AAPL&interval=4h&days=3
 */
import type { Logger } from "../logging/logger";

export async function getHistoricalIntraday(request: Request, url: URL, env: Env, logger: Logger): Promise<Response> {
    const symbol = url.searchParams.get("symbol");
    const interval = url.searchParams.get("interval") || "4h";
    const daysParam = url.searchParams.get("days") || "3";

    if (!symbol) {
        return json({ error: "symbol parameter is required" }, 400, request);
    }

    const days = parseInt(daysParam, 10);
    if (isNaN(days) || days <= 0 || days > 30) {
        return json({ error: "days parameter must be between 1 and 30" }, 400, request);
    }

    // Validate interval format
    try {
        parseIntervalToMinutes(interval);
    } catch (error: any) {
        return json({ error: error.message }, 400, request);
    }

    const normalizedSymbol = symbol.trim().toUpperCase();

    // Calculate date range
    const toDate = new Date();
    const fromDate = new Date(toDate);
    fromDate.setDate(fromDate.getDate() - days);

    const fromDateStr = formatDate(fromDate);
    const toDateStr = formatDate(toDate);

    try {
        console.log(`[getHistoricalIntraday] Fetching ${interval} data for ${normalizedSymbol} (${fromDateStr} to ${toDateStr})`);

        // Fetch 30-minute data from FMP API
        const thirtyMinData = await fetch30MinuteData(normalizedSymbol, fromDateStr, toDateStr, env);

        if (thirtyMinData.length === 0) {
            console.warn(`[getHistoricalIntraday] No 30-minute data available for ${normalizedSymbol}`);
            return json({
                symbol: normalizedSymbol,
                interval,
                days,
                from: fromDateStr,
                to: toDateStr,
                data: [],
            }, 200, request);
        }

        // Aggregate to requested interval
        const aggregatedData = aggregateToInterval(thirtyMinData, interval);

        console.log(`[getHistoricalIntraday] Aggregated ${thirtyMinData.length} 30-min candles into ${aggregatedData.length} ${interval} candles`);

        return json({
            symbol: normalizedSymbol,
            interval,
            days,
            from: fromDateStr,
            to: toDateStr,
            data: aggregatedData,
        }, 200, request);
    } catch (error: any) {
        console.error(`[getHistoricalIntraday] Error: ${error.message}`, error);
        return json({
            error: `Failed to fetch intraday data: ${error.message}`,
            symbol: normalizedSymbol,
            interval,
            days,
        }, 500, request);
    }
}
