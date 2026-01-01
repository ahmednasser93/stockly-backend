-- Create senate_trades table for storing US Senate and House trading disclosures
-- This table stores trading data fetched from FMP API /v4/senate-trading endpoint
CREATE TABLE IF NOT EXISTS senate_trades (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  senator_name TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_senate_trades_symbol ON senate_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_senate_trades_senator_name ON senate_trades(senator_name);
CREATE INDEX IF NOT EXISTS idx_senate_trades_disclosure_date ON senate_trades(disclosure_date);
CREATE INDEX IF NOT EXISTS idx_senate_trades_transaction_type ON senate_trades(transaction_type);
CREATE INDEX IF NOT EXISTS idx_senate_trades_fmp_id ON senate_trades(fmp_id);


