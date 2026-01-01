/**
 * Repository for Senate Trading data
 * Handles database operations for senate_trades table
 */

import type { Env } from "../../index";
import type {
  SenateTradeRecord,
  SenateTradeRow,
  SenateTradingFilter,
} from "../senate-trading/types";
import { mapRowToTradeRecord } from "../senate-trading/models";

/**
 * Upsert a senate trade record
 * Uses fmp_id for deduplication
 */
export async function upsertTrade(
  env: Env,
  trade: SenateTradeRecord
): Promise<void> {
  try {
    // Validate trade data before database operations
    if (!trade.symbol || trade.symbol.trim().length === 0) {
      throw new Error("Trade symbol is required");
    }
    if (trade.symbol.length > 10) {
      throw new Error("Trade symbol must be 10 characters or less");
    }
    if (!trade.senatorName || trade.senatorName.trim().length === 0) {
      throw new Error("Senator name is required");
    }
    if (trade.senatorName.length > 200) {
      throw new Error("Senator name must be 200 characters or less");
    }
    if (!["Purchase", "Sale", "Exchange"].includes(trade.transactionType)) {
      throw new Error(`Invalid transaction type: ${trade.transactionType}`);
    }
    if (trade.amountRangeMin !== null && trade.amountRangeMax !== null) {
      if (trade.amountRangeMin < 0 || trade.amountRangeMax < 0) {
        throw new Error("Amount ranges must be non-negative");
      }
      if (trade.amountRangeMin > trade.amountRangeMax) {
        throw new Error("amountRangeMin must be less than or equal to amountRangeMax");
      }
    }
    if (!trade.disclosureDate || !/^\d{4}-\d{2}-\d{2}$/.test(trade.disclosureDate)) {
      throw new Error("disclosureDate must be in YYYY-MM-DD format");
    }
    if (trade.transactionDate && !/^\d{4}-\d{2}-\d{2}$/.test(trade.transactionDate)) {
      throw new Error("transactionDate must be in YYYY-MM-DD format");
    }

    const now = new Date().toISOString();

    // If fmp_id exists, try to update existing record
    if (trade.fmpId) {
      const existing = await getTradeByFmpId(env, trade.fmpId);
      if (existing) {
        // Update existing record
        await env.stockly
          .prepare(
            `UPDATE senate_trades 
             SET symbol = ?, senator_name = ?, transaction_type = ?, 
                 amount_range_min = ?, amount_range_max = ?, 
                 disclosure_date = ?, transaction_date = ?, 
                 updated_at = ?
             WHERE fmp_id = ?`
          )
          .bind(
            trade.symbol,
            trade.senatorName,
            trade.transactionType,
            trade.amountRangeMin,
            trade.amountRangeMax,
            trade.disclosureDate,
            trade.transactionDate,
            now,
            trade.fmpId
          )
          .run();
        return;
      }
    }

    // Insert new record
    await env.stockly
      .prepare(
        `INSERT INTO senate_trades 
         (id, symbol, senator_name, transaction_type, amount_range_min, amount_range_max, 
          disclosure_date, transaction_date, fmp_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        trade.id,
        trade.symbol,
        trade.senatorName,
        trade.transactionType,
        trade.amountRangeMin,
        trade.amountRangeMax,
        trade.disclosureDate,
        trade.transactionDate,
        trade.fmpId,
        trade.createdAt || now,
        now
      )
      .run();
  } catch (error) {
    // Handle constraint violations gracefully
    if (error instanceof Error) {
      if (error.message.includes("UNIQUE constraint") || error.message.includes("constraint")) {
        console.warn("[upsertTrade] Constraint violation (likely duplicate fmp_id):", error.message);
        // This is expected for duplicate trades, don't throw
        return;
      }
      if (error.message.includes("CHECK constraint")) {
        console.error("[upsertTrade] Data validation failed:", error.message);
        throw new Error(`Invalid trade data: ${error.message}`);
      }
    }
    console.error("[upsertTrade] Error upserting trade:", error);
    throw error;
  }
}

/**
 * Get trades by stock symbol
 */
export async function getTradesBySymbol(
  env: Env,
  symbol: string,
  limit: number = 100
): Promise<SenateTradeRecord[]> {
  try {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const result = await env.stockly
      .prepare(
        `SELECT id, symbol, senator_name, transaction_type, amount_range_min, 
                amount_range_max, disclosure_date, transaction_date, fmp_id, 
                created_at, updated_at
         FROM senate_trades
         WHERE symbol = ?
         ORDER BY disclosure_date DESC, created_at DESC
         LIMIT ?`
      )
      .bind(normalizedSymbol, limit)
      .all<SenateTradeRow>();

    return (result.results ?? []).map(mapRowToTradeRecord);
  } catch (error) {
    console.error("[getTradesBySymbol] Error fetching trades:", error);
    throw error;
  }
}

/**
 * Get recent trades (most recent first)
 */
export async function getRecentTrades(
  env: Env,
  limit: number = 100
): Promise<SenateTradeRecord[]> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT id, symbol, senator_name, transaction_type, amount_range_min, 
                amount_range_max, disclosure_date, transaction_date, fmp_id, 
                created_at, updated_at
         FROM senate_trades
         ORDER BY disclosure_date DESC, created_at DESC
         LIMIT ?`
      )
      .bind(limit)
      .all<SenateTradeRow>();

    return (result.results ?? []).map(mapRowToTradeRecord);
  } catch (error) {
    console.error("[getRecentTrades] Error fetching recent trades:", error);
    throw error;
  }
}

/**
 * Get trades by senator name
 */
export async function getTradesBySenator(
  env: Env,
  senatorName: string,
  limit: number = 100
): Promise<SenateTradeRecord[]> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT id, symbol, senator_name, transaction_type, amount_range_min, 
                amount_range_max, disclosure_date, transaction_date, fmp_id, 
                created_at, updated_at
         FROM senate_trades
         WHERE senator_name = ?
         ORDER BY disclosure_date DESC, created_at DESC
         LIMIT ?`
      )
      .bind(senatorName, limit)
      .all<SenateTradeRow>();

    return (result.results ?? []).map(mapRowToTradeRecord);
  } catch (error) {
    console.error("[getTradesBySenator] Error fetching trades:", error);
    throw error;
  }
}

/**
 * Get trade by FMP ID (for deduplication)
 */
export async function getTradeByFmpId(
  env: Env,
  fmpId: string
): Promise<SenateTradeRecord | null> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT id, symbol, senator_name, transaction_type, amount_range_min, 
                amount_range_max, disclosure_date, transaction_date, fmp_id, 
                created_at, updated_at
         FROM senate_trades
         WHERE fmp_id = ?`
      )
      .bind(fmpId)
      .first<SenateTradeRow>();

    return result ? mapRowToTradeRecord(result) : null;
  } catch (error) {
    console.error("[getTradeByFmpId] Error fetching trade:", error);
    throw error;
  }
}

/**
 * Get trades with filters
 */
export async function getTradesWithFilters(
  env: Env,
  filters: SenateTradingFilter
): Promise<SenateTradeRecord[]> {
  try {
    let query = `SELECT id, symbol, senator_name, transaction_type, amount_range_min, 
                        amount_range_max, disclosure_date, transaction_date, fmp_id, 
                        created_at, updated_at
                 FROM senate_trades
                 WHERE 1=1`;
    const bindings: any[] = [];

    if (filters.symbol) {
      query += ` AND symbol = ?`;
      bindings.push(filters.symbol.trim().toUpperCase());
    }

    if (filters.senatorName) {
      query += ` AND senator_name = ?`;
      bindings.push(filters.senatorName);
    }

    if (filters.transactionType) {
      query += ` AND transaction_type = ?`;
      bindings.push(filters.transactionType);
    }

    if (filters.startDate) {
      query += ` AND disclosure_date >= ?`;
      bindings.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ` AND disclosure_date <= ?`;
      bindings.push(filters.endDate);
    }

    query += ` ORDER BY disclosure_date DESC, created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT ?`;
      bindings.push(filters.limit);
    } else {
      query += ` LIMIT 100`;
    }

    if (filters.offset) {
      query += ` OFFSET ?`;
      bindings.push(filters.offset);
    }

    const result = await env.stockly.prepare(query).bind(...bindings).all<SenateTradeRow>();

    return (result.results ?? []).map(mapRowToTradeRecord);
  } catch (error) {
    console.error("[getTradesWithFilters] Error fetching trades:", error);
    throw error;
  }
}

/**
 * Get unique list of all senators
 */
export async function getAllSenators(env: Env): Promise<string[]> {
  try {
    const result = await env.stockly
      .prepare(`SELECT DISTINCT senator_name FROM senate_trades ORDER BY senator_name`)
      .all<{ senator_name: string }>();

    return (result.results ?? []).map((row) => row.senator_name);
  } catch (error) {
    console.error("[getAllSenators] Error fetching senators:", error);
    throw error;
  }
}

/**
 * Get popular senators by most trades (last 90 days)
 * Returns senators sorted by number of trades
 */
export async function getPopularSenatorsByTrades(
  env: Env,
  limit: number = 10
): Promise<Array<{ senatorName: string; tradeCount: number }>> {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = ninetyDaysAgo.toISOString().split('T')[0];

    const result = await env.stockly
      .prepare(
        `SELECT senator_name, COUNT(*) as trade_count
         FROM senate_trades
         WHERE disclosure_date >= ?
         GROUP BY senator_name
         ORDER BY trade_count DESC, senator_name ASC
         LIMIT ?`
      )
      .bind(dateStr, limit)
      .all<{ senator_name: string; trade_count: number }>();

    return (result.results ?? []).map((row) => ({
      senatorName: row.senator_name,
      tradeCount: row.trade_count,
    }));
  } catch (error) {
    console.error("[getPopularSenatorsByTrades] Error fetching popular senators:", error);
    throw error;
  }
}

/**
 * Get popular senators by most followers
 * Returns senators sorted by number of users following them
 */
export async function getPopularSenatorsByFollowers(
  env: Env,
  limit: number = 10
): Promise<Array<{ senatorName: string; followerCount: number }>> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT senator_name, COUNT(DISTINCT user_id) as follower_count
         FROM user_senator_follows
         GROUP BY senator_name
         ORDER BY follower_count DESC, senator_name ASC
         LIMIT ?`
      )
      .bind(limit)
      .all<{ senator_name: string; follower_count: number }>();

    return (result.results ?? []).map((row) => ({
      senatorName: row.senator_name,
      followerCount: row.follower_count,
    }));
  } catch (error) {
    console.error("[getPopularSenatorsByFollowers] Error fetching popular senators:", error);
    throw error;
  }
}

/**
 * Search senators by name (autocomplete)
 * Returns senators whose names match the query (case-insensitive)
 */
export async function searchSenators(
  env: Env,
  query: string,
  limit: number = 20
): Promise<string[]> {
  try {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchPattern = `%${query.trim()}%`;
    const result = await env.stockly
      .prepare(
        `SELECT DISTINCT senator_name 
         FROM senate_trades
         WHERE senator_name LIKE ?
         ORDER BY senator_name ASC
         LIMIT ?`
      )
      .bind(searchPattern, limit)
      .all<{ senator_name: string }>();

    return (result.results ?? []).map((row) => row.senator_name);
  } catch (error) {
    console.error("[searchSenators] Error searching senators:", error);
    throw error;
  }
}

/**
 * Get trades since a specific date (for alert evaluation)
 */
export async function getTradesSince(
  env: Env,
  sinceDate: string,
  limit: number = 1000
): Promise<SenateTradeRecord[]> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT id, symbol, senator_name, transaction_type, amount_range_min, 
                amount_range_max, disclosure_date, transaction_date, fmp_id, 
                created_at, updated_at
         FROM senate_trades
         WHERE disclosure_date >= ? OR created_at >= ?
         ORDER BY disclosure_date DESC, created_at DESC
         LIMIT ?`
      )
      .bind(sinceDate, sinceDate, limit)
      .all<SenateTradeRow>();

    return (result.results ?? []).map(mapRowToTradeRecord);
  } catch (error) {
    console.error("[getTradesSince] Error fetching trades:", error);
    throw error;
  }
}

