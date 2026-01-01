-- Create house_trades table for storing US House of Representatives trading disclosures
-- This table stores trading data fetched from FMP API /stable/house-latest endpoint
CREATE TABLE IF NOT EXISTS house_trades (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  representative_name TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Purchase', 'Sale', 'Exchange')),
  amount_range_min REAL,
  amount_range_max REAL,
  disclosure_date TEXT NOT NULL,
  transaction_date TEXT,
  fmp_id TEXT UNIQUE, -- FMP's unique identifier for deduplication
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_house_trades_symbol ON house_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_house_trades_representative_name ON house_trades(representative_name);
CREATE INDEX IF NOT EXISTS idx_house_trades_disclosure_date ON house_trades(disclosure_date);
CREATE INDEX IF NOT EXISTS idx_house_trades_transaction_type ON house_trades(transaction_type);
CREATE INDEX IF NOT EXISTS idx_house_trades_fmp_id ON house_trades(fmp_id);

