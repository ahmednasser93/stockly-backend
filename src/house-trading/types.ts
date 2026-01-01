/**
 * Types for House Trading feature
 * Handles US House of Representatives trading disclosures from FMP API
 */

import type { TransactionType } from "../senate-trading/types";

/**
 * House trade data from FMP API response
 */
export interface HouseTrade {
  symbol: string;
  representativeName: string;
  transactionType: TransactionType;
  amountRangeMin?: number;
  amountRangeMax?: number;
  disclosureDate: string;
  transactionDate?: string;
  fmpId?: string; // FMP's unique identifier
}

/**
 * House trade record stored in database
 */
export interface HouseTradeRecord {
  id: string;
  symbol: string;
  representativeName: string;
  transactionType: TransactionType;
  amountRangeMin: number | null;
  amountRangeMax: number | null;
  disclosureDate: string;
  transactionDate: string | null;
  fmpId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Filter options for querying house trades
 */
export interface HouseTradingFilter {
  symbol?: string;
  representativeName?: string;
  transactionType?: TransactionType;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Database row structure for house_trades table
 */
export interface HouseTradeRow {
  id: string;
  symbol: string;
  representative_name: string;
  transaction_type: string;
  amount_range_min: number | null;
  amount_range_max: number | null;
  disclosure_date: string;
  transaction_date: string | null;
  fmp_id: string | null;
  created_at: string;
  updated_at: string;
}

