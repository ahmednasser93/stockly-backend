/**
 * Types for Senate Trading feature
 * Handles US Senate and House trading disclosures from FMP API
 */

export type TransactionType = "Purchase" | "Sale" | "Exchange";

/**
 * Senate trade data from FMP API response
 */
export interface SenateTrade {
  symbol: string;
  senatorName: string;
  transactionType: TransactionType;
  amountRangeMin?: number;
  amountRangeMax?: number;
  disclosureDate: string;
  transactionDate?: string;
  fmpId?: string; // FMP's unique identifier
}

/**
 * Senate trade record stored in database
 */
export interface SenateTradeRecord {
  id: string;
  symbol: string;
  senatorName: string;
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
 * User's follow relationship with a senator
 */
export interface UserSenatorFollow {
  userId: string;
  username: string;
  senatorName: string;
  alertOnPurchase: boolean;
  alertOnSale: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Preferences for senator follow alerts
 */
export interface SenatorFollowPreferences {
  alertOnPurchase: boolean;
  alertOnSale: boolean;
}

/**
 * Senator alert preferences at user level
 */
export interface SenatorAlertPreferences {
  senatorAlertsEnabled: boolean;
  senatorAlertHoldingsOnly: boolean; // Only alert for held stocks
  senatorAlertFollowedOnly: boolean; // Only alert for followed senators
}

/**
 * Filter options for querying senate trades
 */
export interface SenateTradingFilter {
  symbol?: string;
  senatorName?: string;
  transactionType?: TransactionType;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Database row structure for senate_trades table
 */
export interface SenateTradeRow {
  id: string;
  symbol: string;
  senator_name: string;
  transaction_type: string;
  amount_range_min: number | null;
  amount_range_max: number | null;
  disclosure_date: string;
  transaction_date: string | null;
  fmp_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database row structure for user_senator_follows table
 */
export interface UserSenatorFollowRow {
  user_id: string;
  username: string;
  senator_name: string;
  alert_on_purchase: number;
  alert_on_sale: number;
  created_at: string;
  updated_at: string;
}


