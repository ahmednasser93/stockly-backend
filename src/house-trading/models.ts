/**
 * Model mapping functions for House Trading
 * Converts between FMP API responses, database rows, and domain models
 */

import type { TransactionType } from "../senate-trading/types";
import type {
  HouseTrade,
  HouseTradeRecord,
  HouseTradeRow,
} from "./types";

/**
 * Map FMP API response to HouseTrade domain model
 * FMP API format may vary, this handles common structure
 * Note: FMP API may use "senator" or "representative" field names
 */
export function mapFmpResponseToHouseTrade(data: any): HouseTrade | null {
  try {
    // FMP API may return different field names, handle common variations
    const symbol = data.symbol || data.ticker || "";
    // For House trades, FMP may use "senator", "representative", "name", or "representative_name"
    const representativeName = data.representative || data.representative_name || data.senator || data.senator_name || data.name || "";
    const transactionType = (data.type || data.transaction_type || data.transactionType || "") as string;
    const disclosureDate = data.disclosure_date || data.disclosureDate || data.date || "";
    const transactionDate = data.transaction_date || data.transactionDate || null;
    const fmpId = data.id || data.fmp_id || data.fmpId || null;

    // Parse amount range - FMP may provide as string like "$15,001 - $50,000" or separate fields
    let amountRangeMin: number | undefined;
    let amountRangeMax: number | undefined;

    if (data.amount_range) {
      // Parse range string like "$15,001 - $50,000"
      const rangeMatch = data.amount_range.match(/\$?([\d,]+)\s*-\s*\$?([\d,]+)/);
      if (rangeMatch) {
        amountRangeMin = parseFloat(rangeMatch[1].replace(/,/g, ""));
        amountRangeMax = parseFloat(rangeMatch[2].replace(/,/g, ""));
      }
    } else {
      amountRangeMin = data.amount_range_min || data.amountRangeMin || data.min_amount || undefined;
      amountRangeMax = data.amount_range_max || data.amountRangeMax || data.max_amount || undefined;
    }

    // Validate required fields
    if (!symbol || !representativeName || !disclosureDate) {
      return null;
    }

    // Normalize transaction type
    const normalizedType = normalizeTransactionType(transactionType);
    if (!normalizedType) {
      return null;
    }

    return {
      symbol: symbol.toUpperCase().trim(),
      representativeName: representativeName.trim(),
      transactionType: normalizedType,
      amountRangeMin,
      amountRangeMax,
      disclosureDate,
      transactionDate: transactionDate || undefined,
      fmpId: fmpId || undefined,
    };
  } catch (error) {
    console.error("Error mapping FMP response to house trade:", error, data);
    return null;
  }
}

/**
 * Normalize transaction type string to TransactionType enum
 */
function normalizeTransactionType(type: string): TransactionType | null {
  const normalized = type.trim();
  const upper = normalized.toUpperCase();

  if (upper.includes("PURCHASE") || upper.includes("BUY") || upper === "P") {
    return "Purchase";
  }
  if (upper.includes("SALE") || upper.includes("SELL") || upper === "S") {
    return "Sale";
  }
  if (upper.includes("EXCHANGE") || upper.includes("EXCH") || upper === "E") {
    return "Exchange";
  }

  return null;
}

/**
 * Map database row to HouseTradeRecord domain model
 */
export function mapRowToHouseTradeRecord(row: HouseTradeRow): HouseTradeRecord {
  return {
    id: row.id,
    symbol: row.symbol,
    representativeName: row.representative_name,
    transactionType: row.transaction_type as TransactionType,
    amountRangeMin: row.amount_range_min,
    amountRangeMax: row.amount_range_max,
    disclosureDate: row.disclosure_date,
    transactionDate: row.transaction_date,
    fmpId: row.fmp_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map HouseTradeRecord to database row format
 */
export function mapHouseTradeRecordToRow(record: HouseTradeRecord): HouseTradeRow {
  return {
    id: record.id,
    symbol: record.symbol,
    representative_name: record.representativeName,
    transaction_type: record.transactionType,
    amount_range_min: record.amountRangeMin,
    amount_range_max: record.amountRangeMax,
    disclosure_date: record.disclosureDate,
    transaction_date: record.transactionDate,
    fmp_id: record.fmpId,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

/**
 * Format amount range for display
 * e.g., "$15,001 - $50,000"
 */
export function formatAmountRange(
  min: number | null | undefined,
  max: number | null | undefined
): string {
  if (min === null || min === undefined) {
    return "Amount not disclosed";
  }
  if (max === null || max === undefined) {
    return `$${min.toLocaleString()}+`;
  }
  return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
}

/**
 * Format alert message for house trade
 * e.g., "Representative Nancy Pelosi just bought $50k of AAPL"
 */
export function formatHouseTradeAlertMessage(
  representativeName: string,
  transactionType: TransactionType,
  symbol: string,
  amountRangeMin?: number | null,
  amountRangeMax?: number | null
): string {
  const action = transactionType === "Purchase" ? "bought" : transactionType === "Sale" ? "sold" : "exchanged";
  const amount = formatAmountRange(amountRangeMin, amountRangeMax);
  return `Representative ${representativeName} just ${action} ${amount} of ${symbol}`;
}

