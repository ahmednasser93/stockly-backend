/**
 * Type definitions for Stock Details API
 * Unified JSON structure for comprehensive stock information
 */

export interface StockProfile {
  companyName: string;
  industry: string;
  sector: string;
  description: string;
  website: string;
  image: string;
}

export interface StockQuote {
  price: number;
  change: number;
  changesPercentage: number;
  dayHigh: number;
  dayLow: number;
  open: number;
  previousClose: number;
  volume: number;
  marketCap: number;
}

export interface ChartDataPoint {
  date: string;
  price: number;
  volume?: number;
}

export interface StockChart {
  "1D": ChartDataPoint[];
  "1W": ChartDataPoint[];
  "1M": ChartDataPoint[];
  "3M": ChartDataPoint[];
  "1Y": ChartDataPoint[];
  "ALL": ChartDataPoint[];
}

export interface IncomeStatement {
  date: string;
  revenue?: number;
  netIncome?: number;
  eps?: number;
  [key: string]: any; // Allow other FMP fields
}

export interface KeyMetric {
  date: string;
  peRatio?: number;
  priceToBook?: number;
  [key: string]: any; // Allow other FMP fields
}

export interface FinancialRatio {
  date: string;
  currentRatio?: number;
  debtToEquity?: number;
  [key: string]: any; // Allow other FMP fields
}

export interface StockFinancials {
  income: IncomeStatement[];
  keyMetrics: KeyMetric[];
  ratios: FinancialRatio[];
}

export interface StockNews {
  title: string;
  text: string;
  url: string;
  publishedDate: string;
  image?: string;
}

export interface StockPeer {
  symbol: string;
  name: string;
  price?: number;
}

export interface StockDetails {
  symbol: string;
  profile: StockProfile;
  quote: StockQuote;
  chart: StockChart;
  financials: StockFinancials;
  news: StockNews[];
  peers: StockPeer[];
  partial?: boolean; // true if some data failed to fetch
  cached?: boolean; // true if served from cache
  refreshedAt?: number; // timestamp when data was fetched
}

