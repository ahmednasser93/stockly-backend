/**
 * Repository for House Trading data
 * Handles database operations for house_trades table
 */

import type { Env } from "../../index";
import type {
  HouseTradeRecord,
  HouseTradeRow,
  HouseTradingFilter,
} from "../house-trading/types";
import { mapRowToHouseTradeRecord, mapHouseTradeRecordToRow } from "../house-trading/models";

/**
 * Upsert a house trade record
 * Uses fmp_id for deduplication
 */
export async function upsertTrade(
  env: Env,
  trade: HouseTradeRecord
): Promise<void> {
  try {
    // Validate trade data before database operations
    if (!trade.symbol || trade.symbol.trim().length === 0) {
      throw new Error("Trade symbol is required");
    }
    if (trade.symbol.length > 10) {
      throw new Error("Trade symbol must be 10 characters or less");
    }
    if (!trade.representativeName || trade.representativeName.trim().length === 0) {
      throw new Error("Representative name is required");
    }
    if (trade.representativeName.length > 200) {
      throw new Error("Representative name must be 200 characters or less");
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
            `UPDATE house_trades 
             SET symbol = ?, representative_name = ?, transaction_type = ?, 
                 amount_range_min = ?, amount_range_max = ?, 
                 disclosure_date = ?, transaction_date = ?, 
                 updated_at = ?
             WHERE fmp_id = ?`
          )
          .bind(
            trade.symbol,
            trade.representativeName,
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
        `INSERT INTO house_trades 
         (id, symbol, representative_name, transaction_type, amount_range_min, amount_range_max, 
          disclosure_date, transaction_date, fmp_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        trade.id,
        trade.symbol,
        trade.representativeName,
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
): Promise<HouseTradeRecord[]> {
  try {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const result = await env.stockly
      .prepare(
        `SELECT id, symbol, representative_name, transaction_type, amount_range_min, 
                amount_range_max, disclosure_date, transaction_date, fmp_id, 
                created_at, updated_at
         FROM house_trades
         WHERE symbol = ?
         ORDER BY disclosure_date DESC, created_at DESC
         LIMIT ?`
      )
      .bind(normalizedSymbol, limit)
      .all<HouseTradeRow>();

    return (result.results ?? []).map(mapRowToHouseTradeRecord);
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
): Promise<HouseTradeRecord[]> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT id, symbol, representative_name, transaction_type, amount_range_min, 
                amount_range_max, disclosure_date, transaction_date, fmp_id, 
                created_at, updated_at
         FROM house_trades
         ORDER BY disclosure_date DESC, created_at DESC
         LIMIT ?`
      )
      .bind(limit)
      .all<HouseTradeRow>();

    return (result.results ?? []).map(mapRowToHouseTradeRecord);
  } catch (error) {
    console.error("[getRecentTrades] Error fetching recent trades:", error);
    throw error;
  }
}

/**
 * Get trades by representative name
 */
export async function getTradesByRepresentative(
  env: Env,
  representativeName: string,
  limit: number = 100
): Promise<HouseTradeRecord[]> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT id, symbol, representative_name, transaction_type, amount_range_min, 
                amount_range_max, disclosure_date, transaction_date, fmp_id, 
                created_at, updated_at
         FROM house_trades
         WHERE representative_name = ?
         ORDER BY disclosure_date DESC, created_at DESC
         LIMIT ?`
      )
      .bind(representativeName, limit)
      .all<HouseTradeRow>();

    return (result.results ?? []).map(mapRowToHouseTradeRecord);
  } catch (error) {
    console.error("[getTradesByRepresentative] Error fetching trades:", error);
    throw error;
  }
}

/**
 * Get trade by FMP ID (for deduplication)
 */
export async function getTradeByFmpId(
  env: Env,
  fmpId: string
): Promise<HouseTradeRecord | null> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT id, symbol, representative_name, transaction_type, amount_range_min, 
                amount_range_max, disclosure_date, transaction_date, fmp_id, 
                created_at, updated_at
         FROM house_trades
         WHERE fmp_id = ?`
      )
      .bind(fmpId)
      .first<HouseTradeRow>();

    return result ? mapRowToHouseTradeRecord(result) : null;
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
  filters: HouseTradingFilter
): Promise<HouseTradeRecord[]> {
  try {
    let query = `SELECT id, symbol, representative_name, transaction_type, amount_range_min, 
                        amount_range_max, disclosure_date, transaction_date, fmp_id, 
                        created_at, updated_at
                 FROM house_trades
                 WHERE 1=1`;
    const bindings: any[] = [];

    if (filters.symbol) {
      query += ` AND symbol = ?`;
      bindings.push(filters.symbol.trim().toUpperCase());
    }

    if (filters.representativeName) {
      query += ` AND representative_name = ?`;
      bindings.push(filters.representativeName);
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

    const result = await env.stockly.prepare(query).bind(...bindings).all<HouseTradeRow>();

    return (result.results ?? []).map(mapRowToHouseTradeRecord);
  } catch (error) {
    console.error("[getTradesWithFilters] Error fetching trades:", error);
    throw error;
  }
}

/**
 * Get unique list of all representatives
 */
export async function getAllRepresentatives(env: Env): Promise<string[]> {
  try {
    const result = await env.stockly
      .prepare(`SELECT DISTINCT representative_name FROM house_trades ORDER BY representative_name`)
      .all<{ representative_name: string }>();

    return (result.results ?? []).map((row) => row.representative_name);
  } catch (error) {
    console.error("[getAllRepresentatives] Error fetching representatives:", error);
    throw error;
  }
}

/**
 * Get popular representatives by most trades (last 90 days)
 * Returns representatives sorted by number of trades
 */
export async function getPopularRepresentativesByTrades(
  env: Env,
  limit: number = 10
): Promise<Array<{ representativeName: string; tradeCount: number }>> {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = ninetyDaysAgo.toISOString().split('T')[0];

    const result = await env.stockly
      .prepare(
        `SELECT representative_name, COUNT(*) as trade_count
         FROM house_trades
         WHERE disclosure_date >= ?
         GROUP BY representative_name
         ORDER BY trade_count DESC, representative_name ASC
         LIMIT ?`
      )
      .bind(dateStr, limit)
      .all<{ representative_name: string; trade_count: number }>();

    return (result.results ?? []).map((row) => ({
      representativeName: row.representative_name,
      tradeCount: row.trade_count,
    }));
  } catch (error) {
    console.error("[getPopularRepresentativesByTrades] Error fetching popular representatives:", error);
    throw error;
  }
}

/**
 * Search representatives by name (autocomplete)
 * Returns representatives whose names match the query (case-insensitive)
 */
export async function searchRepresentatives(
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
        `SELECT DISTINCT representative_name 
         FROM house_trades
         WHERE representative_name LIKE ?
         ORDER BY representative_name ASC
         LIMIT ?`
      )
      .bind(searchPattern, limit)
      .all<{ representative_name: string }>();

    return (result.results ?? []).map((row) => row.representative_name);
  } catch (error) {
    console.error("[searchRepresentatives] Error searching representatives:", error);
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
): Promise<HouseTradeRecord[]> {
  try {
    const result = await env.stockly
      .prepare(
        `SELECT id, symbol, representative_name, transaction_type, amount_range_min, 
                amount_range_max, disclosure_date, transaction_date, fmp_id, 
                created_at, updated_at
         FROM house_trades
         WHERE disclosure_date >= ? OR created_at >= ?
         ORDER BY disclosure_date DESC, created_at DESC
         LIMIT ?`
      )
      .bind(sinceDate, sinceDate, limit)
      .all<HouseTradeRow>();

    return (result.results ?? []).map(mapRowToHouseTradeRecord);
  } catch (error) {
    console.error("[getTradesSince] Error fetching trades:", error);
    throw error;
  }
}

