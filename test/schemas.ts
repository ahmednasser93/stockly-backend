/**
 * API SCHEMA DEFINITIONS - STRICT TYPES
 * 
 * ⚠️ CRITICAL: DO NOT MODIFY THESE SCHEMAS WITHOUT APPROVAL
 * These schemas define the contract between the API and its clients.
 * Changing these schemas will break API compatibility.
 * 
 * See TEST_SCHEMA_RULES.md for details on schema immutability.
 */

// ============================================================================
// STOCK QUOTE SCHEMAS
// ============================================================================

export interface StockQuoteResponse {
  symbol: string;
  name: string | null;
  price: number;
  change: number | null;
  changePercentage: number | null;
  volume: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  yearLow?: number | null;
  yearHigh?: number | null;
  marketCap?: number | null;
  exchange?: string | null;
  currency?: string | null;
  image: string | null;
  description?: string | null;
  sector?: string | null;
  industry?: string | null;
  companyName?: string | null;
  // Stale data indicators (optional)
  stale?: boolean;
  stale_reason?: string;
  lastUpdatedAt?: string;
  timestamp?: number;
  // Simulation mode indicator (optional)
  simulationActive?: boolean;
}

export interface StockQuotesResponse extends Array<StockQuoteResponse> {}

export interface SearchStockResponse extends Array<{
  symbol: string;
  name: string;
  currency?: string;
  exchangeFullName?: string;
  exchange?: string;
}> {}

// ============================================================================
// HISTORICAL PRICES SCHEMAS
// ============================================================================

export interface HistoricalPriceRecord {
  date: string; // YYYY-MM-DD format
  price: number; // Closing price (backward compatibility)
  close?: number | null; // Closing price (alias, same as price)
  volume?: number | null;
  open?: number | null; // Opening price (null if OHLC data unavailable)
  high?: number | null; // Highest price (null if OHLC data unavailable)
  low?: number | null; // Lowest price (null if OHLC data unavailable)
}

export interface HistoricalPricesResponse {
  symbol: string;
  days?: number; // Optional - only present when using 'days' parameter
  from?: string; // Optional - only present when using 'from'/'to' parameters or calculated internally
  to?: string; // Optional - only present when using 'from'/'to' parameters or calculated internally
  data: HistoricalPriceRecord[];
}

// ============================================================================
// ALERT SCHEMAS
// ============================================================================

export interface Alert {
  id: string; // UUID
  symbol: string;
  direction: "above" | "below";
  threshold: number;
  status: "active" | "paused";
  channel: "email" | "webhook" | "notification";
  target: string;
  notes: string | null;
  createdAt: string; // ISO 8601 date-time
  updatedAt: string; // ISO 8601 date-time
}

export interface AlertsListResponse {
  alerts: Alert[];
}

export interface CreateAlertRequest {
  symbol: string;
  direction: "above" | "below";
  threshold: number;
  channel: "email" | "webhook" | "notification";
  target: string;
  notes?: string | null;
}

export interface UpdateAlertRequest {
  symbol?: string;
  direction?: "above" | "below";
  threshold?: number;
  status?: "active" | "paused";
  channel?: "email" | "webhook" | "notification";
  target?: string;
  notes?: string | null;
}

// ============================================================================
// ERROR SCHEMAS
// ============================================================================

export interface ErrorResponse {
  error: string;
}

export interface SuccessResponse {
  success: boolean;
}

// ============================================================================
// HEALTH CHECK SCHEMAS
// ============================================================================

export interface HealthCheckResponse {
  status: "ok";
}

// ============================================================================
// ADMIN CONFIG SCHEMAS
// ============================================================================

export interface AdminConfig {
  pollingIntervalSec: number;
  primaryProvider: string;
  backupProvider: string;
  alertThrottle: {
    maxAlerts: number;
    windowSeconds: number;
  };
  featureFlags: {
    alerting: boolean;
    sandboxMode: boolean;
    simulateProviderFailure: boolean;
  };
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export function validateStockQuoteResponse(data: any): data is StockQuoteResponse {
  if (!data || typeof data !== "object") return false;
  if (typeof data.symbol !== "string") return false;
  if (data.name !== null && typeof data.name !== "string") return false;
  if (typeof data.price !== "number") return false;
  if (data.change !== null && typeof data.change !== "number") return false;
  if (data.changePercentage !== null && typeof data.changePercentage !== "number") return false;
  if (data.image !== null && typeof data.image !== "string") return false;
  return true;
}

export function validateStockQuotesResponse(data: any): data is StockQuotesResponse {
  if (!Array.isArray(data)) return false;
  return data.every(validateStockQuoteResponse);
}

export function validateAlert(data: any): data is Alert {
  if (!data || typeof data !== "object") return false;
  if (typeof data.id !== "string") return false;
  if (typeof data.symbol !== "string") return false;
  if (!["above", "below"].includes(data.direction)) return false;
  if (typeof data.threshold !== "number") return false;
  if (!["active", "paused"].includes(data.status)) return false;
  if (!["email", "webhook", "notification"].includes(data.channel)) return false;
  if (typeof data.target !== "string") return false;
  if (data.notes !== null && typeof data.notes !== "string") return false;
  if (typeof data.createdAt !== "string") return false;
  if (typeof data.updatedAt !== "string") return false;
  return true;
}

export function validateAlertsListResponse(data: any): data is AlertsListResponse {
  if (!data || typeof data !== "object") return false;
  if (!Array.isArray(data.alerts)) return false;
  return data.alerts.every(validateAlert);
}

export function validateCreateAlertRequest(data: any): data is CreateAlertRequest {
  if (!data || typeof data !== "object") return false;
  if (typeof data.symbol !== "string") return false;
  if (!["above", "below"].includes(data.direction)) return false;
  if (typeof data.threshold !== "number") return false;
  if (!["email", "webhook", "notification"].includes(data.channel)) return false;
  if (typeof data.target !== "string") return false;
  return true;
}

export function validateUpdateAlertRequest(data: any): data is UpdateAlertRequest {
  if (!data || typeof data !== "object") return false;
  if (data.symbol !== undefined && typeof data.symbol !== "string") return false;
  if (data.direction !== undefined && !["above", "below"].includes(data.direction)) return false;
  if (data.threshold !== undefined && typeof data.threshold !== "number") return false;
  if (data.status !== undefined && !["active", "paused"].includes(data.status)) return false;
  if (data.channel !== undefined && !["email", "webhook", "notification"].includes(data.channel)) return false;
  if (data.target !== undefined && typeof data.target !== "string") return false;
  return true;
}

export function validateHistoricalPricesResponse(data: any): data is HistoricalPricesResponse {
  if (!data || typeof data !== "object") return false;
  if (typeof data.symbol !== "string") return false;
  // days, from, to are all optional
  if (data.days !== undefined && typeof data.days !== "number") return false;
  if (data.from !== undefined && typeof data.from !== "string") return false;
  if (data.to !== undefined && typeof data.to !== "string") return false;
  if (!Array.isArray(data.data)) return false;
  return data.data.every((record: any) => {
    if (!record || typeof record !== "object") return false;
    if (typeof record.date !== "string") return false;
    if (typeof record.price !== "number") return false;
    if (record.volume !== undefined && record.volume !== null && typeof record.volume !== "number") return false;
    return true;
  });
}

export function validateHealthCheckResponse(data: any): data is HealthCheckResponse {
  return data && typeof data === "object" && data.status === "ok";
}

export function validateErrorResponse(data: any): data is ErrorResponse {
  return data && typeof data === "object" && typeof data.error === "string";
}

